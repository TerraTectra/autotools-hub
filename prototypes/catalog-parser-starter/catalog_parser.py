from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlsplit, urlunsplit

from playwright.sync_api import Locator, Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


OUTPUT_FIELDS = (
    "company_name",
    "revenue",
    "address",
    "website",
    "profile_url",
    "founded_year",
    "company_type",
)


@dataclass(frozen=True, slots=True)
class CompanyRecord:
    company_name: str = ""
    revenue: str = ""
    address: str = ""
    website: str = ""
    profile_url: str = ""
    founded_year: str = ""
    company_type: str = ""


def normalize_text(value: str | None) -> str:
    """Collapse whitespace and remove invisible spacing characters."""
    if not value:
        return ""
    value = value.replace("\u00a0", " ").replace("\u200b", "")
    return re.sub(r"\s+", " ", value).strip()


def normalize_url(value: str | None, base_url: str = "") -> str:
    """Resolve a URL and remove fragments without changing its query string."""
    value = normalize_text(value)
    if not value:
        return ""
    absolute = urljoin(base_url, value)
    parts = urlsplit(absolute)
    if parts.scheme not in {"http", "https"}:
        return ""
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, ""))


def spreadsheet_safe(value: str) -> str:
    """Prevent spreadsheet formula execution in exported third-party text."""
    return f"'{value}" if value.startswith(("=", "+", "-", "@")) else value


def record_key(record: CompanyRecord) -> str:
    """Create a stable key, preferring the directory profile URL."""
    if record.profile_url:
        return f"profile:{record.profile_url.casefold()}"
    source = "|".join(
        (
            record.company_name.casefold(),
            record.address.casefold(),
            record.website.casefold(),
        )
    )
    return "record:" + hashlib.sha256(source.encode("utf-8")).hexdigest()


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    if not config.get("company_row"):
        raise ValueError("selectors file must define company_row")
    if not isinstance(config.get("fields"), dict):
        raise ValueError("selectors file must define fields")
    return config


def first_value(locator: Locator, spec: dict[str, Any], base_url: str) -> str:
    selector = spec.get("selector")
    if not selector:
        return ""
    target = locator.locator(selector).first
    if target.count() == 0:
        return ""
    attribute = spec.get("attribute")
    try:
        if attribute:
            raw = target.get_attribute(attribute)
            return normalize_url(raw, base_url) if attribute in {"href", "src"} else normalize_text(raw)
        return normalize_text(target.inner_text(timeout=3_000))
    except PlaywrightTimeoutError:
        return ""


def extract_records(page: Page, config: dict[str, Any]) -> list[CompanyRecord]:
    rows = page.locator(config["company_row"])
    records: list[CompanyRecord] = []
    for index in range(rows.count()):
        row = rows.nth(index)
        values: dict[str, str] = {}
        for field in OUTPUT_FIELDS:
            spec = config["fields"].get(field, {})
            values[field] = first_value(row, spec, page.url)
        records.append(CompanyRecord(**values))
    return records


def challenge_visible(page: Page, markers: Iterable[str]) -> bool:
    for marker in markers:
        try:
            if page.locator(marker).first.is_visible(timeout=750):
                return True
        except (PlaywrightTimeoutError, ValueError):
            continue
    return False


def login(page: Page, config: dict[str, Any]) -> None:
    login_config = config.get("login")
    if not login_config:
        return

    email = os.getenv("DIRECTORY_EMAIL")
    password = os.getenv("DIRECTORY_PASSWORD")
    if not email or not password:
        raise RuntimeError(
            "DIRECTORY_EMAIL and DIRECTORY_PASSWORD are required when login is configured"
        )

    page.goto(login_config["url"], wait_until="domcontentloaded")
    if challenge_visible(page, config.get("captcha_markers", [])):
        raise RuntimeError("Verification challenge detected before login; manual action required")

    page.locator(login_config["email"]).fill(email)
    page.locator(login_config["password"]).fill(password)
    page.locator(login_config["submit"]).click()
    page.wait_for_load_state("domcontentloaded")

    if challenge_visible(page, config.get("captcha_markers", [])):
        raise RuntimeError("Verification challenge detected after login; stopping without bypass")

    success_marker = login_config.get("success_marker")
    if success_marker:
        page.locator(success_marker).first.wait_for(state="visible", timeout=15_000)


def advance(page: Page, config: dict[str, Any]) -> bool:
    next_config = config.get("next_page")
    if not next_config or not next_config.get("selector"):
        return False

    button = page.locator(next_config["selector"]).first
    if button.count() == 0:
        return False

    disabled_attribute = next_config.get("disabled_attribute")
    disabled_value = next_config.get("disabled_value")
    if disabled_attribute and button.get_attribute(disabled_attribute) == disabled_value:
        return False

    href = button.get_attribute("href")
    if href:
        next_url = normalize_url(href, page.url)
        if not next_url or next_url == normalize_url(page.url):
            return False
        page.goto(next_url, wait_until="domcontentloaded")
        return True

    previous_url = page.url
    button.click()
    try:
        page.wait_for_load_state("domcontentloaded", timeout=15_000)
    except PlaywrightTimeoutError:
        pass
    return page.url != previous_url or button.count() > 0


def parse_directory(
    *,
    category_url: str,
    config: dict[str, Any],
    max_pages: int,
    delay_seconds: float,
    headed: bool,
    storage_state: Path | None,
    save_storage_state: Path | None,
) -> list[CompanyRecord]:
    if max_pages < 1:
        raise ValueError("max_pages must be at least 1")
    if delay_seconds < 0:
        raise ValueError("delay_seconds cannot be negative")

    unique: dict[str, CompanyRecord] = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not headed)
        context_options: dict[str, Any] = {}
        if storage_state and storage_state.exists():
            context_options["storage_state"] = str(storage_state)
        context = browser.new_context(**context_options)
        page = context.new_page()
        page.set_default_timeout(10_000)

        try:
            if not storage_state or not storage_state.exists():
                login(page, config)

            page.goto(category_url, wait_until="domcontentloaded")

            for page_number in range(1, max_pages + 1):
                if challenge_visible(page, config.get("captcha_markers", [])):
                    raise RuntimeError(
                        f"Verification challenge detected on page {page_number}; stopping without bypass"
                    )

                page.locator(config["company_row"]).first.wait_for(
                    state="visible", timeout=20_000
                )
                extracted = extract_records(page, config)
                if not extracted:
                    raise RuntimeError(f"No company rows extracted on page {page_number}")

                for record in extracted:
                    if record.company_name or record.profile_url:
                        unique.setdefault(record_key(record), record)

                print(
                    f"page={page_number} extracted={len(extracted)} unique_total={len(unique)}"
                )

                if page_number == max_pages or not advance(page, config):
                    break
                time.sleep(delay_seconds)

            if save_storage_state:
                save_storage_state.parent.mkdir(parents=True, exist_ok=True)
                context.storage_state(path=str(save_storage_state))
        finally:
            context.close()
            browser.close()

    return list(unique.values())


def write_csv(records: Iterable[CompanyRecord], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        for record in records:
            writer.writerow(
                {field: spreadsheet_safe(str(value)) for field, value in asdict(record).items()}
            )


def write_google_sheet(
    records: Iterable[CompanyRecord], spreadsheet_id: str, worksheet_name: str
) -> None:
    credentials = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not credentials:
        raise RuntimeError(
            "GOOGLE_APPLICATION_CREDENTIALS is required for Google Sheets export"
        )

    import gspread

    client = gspread.service_account(filename=credentials)
    spreadsheet = client.open_by_key(spreadsheet_id)
    try:
        worksheet = spreadsheet.worksheet(worksheet_name)
    except gspread.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title=worksheet_name, rows=1000, cols=20)

    rows = [list(OUTPUT_FIELDS)]
    for record in records:
        values = asdict(record)
        rows.append([spreadsheet_safe(str(values[field])) for field in OUTPUT_FIELDS])

    worksheet.clear()
    worksheet.update(rows, "A1", value_input_option="RAW")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Authenticated directory parser starter with CSV/Google Sheets export"
    )
    parser.add_argument("--category-url", required=True)
    parser.add_argument("--selectors", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("companies.csv"))
    parser.add_argument("--max-pages", type=int, default=3)
    parser.add_argument("--delay-seconds", type=float, default=2.0)
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--storage-state", type=Path)
    parser.add_argument("--save-storage-state", type=Path)
    parser.add_argument("--spreadsheet-id")
    parser.add_argument("--worksheet", default="Companies")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    config = load_config(args.selectors)
    records = parse_directory(
        category_url=args.category_url,
        config=config,
        max_pages=args.max_pages,
        delay_seconds=args.delay_seconds,
        headed=args.headed,
        storage_state=args.storage_state,
        save_storage_state=args.save_storage_state,
    )
    write_csv(records, args.output)
    if args.spreadsheet_id:
        write_google_sheet(records, args.spreadsheet_id, args.worksheet)
    print(f"saved={len(records)} csv={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
