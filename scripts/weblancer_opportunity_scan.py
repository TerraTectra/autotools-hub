from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

BASE_URL = "https://www.weblancer.net"
USER_AGENT = "TerraTectra-Opportunity-Scanner/1.0"
CATEGORY_URLS = (
    f"{BASE_URL}/freelance/veb-programmirovanie-31/",
    f"{BASE_URL}/freelance/napisanie-skriptov/",
    f"{BASE_URL}/freelance/sozdanie-botov/",
    f"{BASE_URL}/freelance/integratsiya-api/",
    f"{BASE_URL}/freelance/parsing-dannikh/",
    f"{BASE_URL}/freelance/testirovanie-saitov/",
)
JOB_PATH = re.compile(r"^/freelance/[^/]+/[^/?#]+-\d+/?$")
DATE_PATTERN = re.compile(r"\b(\d{2})\.(\d{2})\.(\d{4})\b")

POSITIVE_PATTERNS = {
    "python": re.compile(r"\bpython\b|\bпитон\b", re.IGNORECASE),
    "telegram": re.compile(r"telegram|телеграм|aiogram", re.IGNORECASE),
    "api": re.compile(r"\bapi\b|webhook|вебхук", re.IGNORECASE),
    "data": re.compile(r"парс|scrap|сбор данн|excel|xlsx|csv|google sheets|гугл табл|pandas|openpyxl", re.IGNORECASE),
    "qa": re.compile(r"\bqa\b|тестирован|test case|bug report|проверить сайт", re.IGNORECASE),
    "node": re.compile(r"node\.?js|typescript|javascript|react", re.IGNORECASE),
    "automation": re.compile(r"автоматизац|скрипт|бот|sqlite|json", re.IGNORECASE),
}

BLOCK_PATTERNS = {
    "captcha-or-verification-bypass": re.compile(r"обход\w* капч|captcha bypass|видео[- ]?верификац|виртуальн\w* камер", re.IGNORECASE),
    "mass-messaging-or-spam": re.compile(r"массов\w* рассыл|рассылк\w* личн\w* сообщ|по группам facebook|спам", re.IGNORECASE),
    "game-cheating-or-anticheat": re.compile(r"easy anti[- ]?cheat|\beac\b|бот\w* по чекпоинт|автоматизир\w* бот\w*.*(?:gta|игр)|для списыван", re.IGNORECASE),
    "gambling": re.compile(r"казино|рулетк|ставк\w* на спорт", re.IGNORECASE),
    "antidetect-or-fingerprint-spoofing": re.compile(r"антидетект|подмен\w* отпечат", re.IGNORECASE),
    "visa-slot-automation": re.compile(r"визов\w* центр|vfs global|миграционн\w* служб.*запис", re.IGNORECASE),
    "account-farming": re.compile(r"мультиаккаунт|смен\w* аккаунт|создать два аккаунта", re.IGNORECASE),
}


class VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self.h1_parts: list[str] = []
        self._skip_depth = 0
        self._href: str | None = None
        self._anchor_parts: list[str] = []
        self._in_h1 = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._anchor_parts = []
        elif tag == "h1":
            self._in_h1 = True

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "noscript", "svg"}:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag == "a" and self._href:
            anchor = " ".join(self._anchor_parts).strip()
            self.links.append((self._href, anchor))
            self._href = None
            self._anchor_parts = []
        elif tag == "h1":
            self._in_h1 = False

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        value = " ".join(html.unescape(data).split())
        if not value:
            return
        self.text_parts.append(value)
        if self._href is not None:
            self._anchor_parts.append(value)
        if self._in_h1:
            self.h1_parts.append(value)

    @property
    def text(self) -> str:
        return "\n".join(self.text_parts)

    @property
    def h1(self) -> str:
        return " ".join(self.h1_parts).strip()


@dataclass
class Opportunity:
    title: str
    url: str
    status: str
    budget: str | None
    applications: int | None
    views: int | None
    published_at: str | None
    age_days: int | None
    relevant_signals: list[str]
    blocking_reasons: list[str]
    customer_blocked: bool
    selected_executor: bool
    registration_required: bool
    actionable: bool


def read_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ru,en;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def parse_html(source: str) -> VisibleTextParser:
    parser = VisibleTextParser()
    parser.feed(source)
    parser.close()
    return parser


def extract_job_links(source: str) -> list[str]:
    parser = parse_html(source)
    found: set[str] = set()
    for href, _ in parser.links:
        absolute = urllib.parse.urljoin(BASE_URL, href)
        parsed = urllib.parse.urlparse(absolute)
        if parsed.netloc not in {"www.weblancer.net", "weblancer.net"}:
            continue
        if JOB_PATH.match(parsed.path):
            found.add(urllib.parse.urlunparse(("https", "www.weblancer.net", parsed.path, "", "", "")))
    return sorted(found)


def field_after(lines: list[str], label: str) -> str | None:
    target = label.casefold()
    for index, value in enumerate(lines[:-1]):
        if value.casefold() == target:
            return lines[index + 1].strip()
    return None


def integer_field(lines: list[str], label: str) -> int | None:
    value = field_after(lines, label)
    if value is None:
        return None
    digits = re.sub(r"\D", "", value)
    return int(digits) if digits else None


def parse_published_at(text: str) -> datetime | None:
    match = DATE_PATTERN.search(text)
    if not match:
        return None
    day, month, year = map(int, match.groups())
    try:
        return datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        return None


def parse_card(
    url: str,
    source: str,
    *,
    now: datetime | None = None,
    max_applications: int = 5,
    max_age_days: int = 21,
) -> Opportunity:
    parser = parse_html(source)
    lines = [part.strip() for part in parser.text.splitlines() if part.strip()]
    text = " ".join(lines)
    title = parser.h1 or "(untitled)"
    status = field_after(lines, "Статус") or "Неизвестно"
    applications = integer_field(lines, "Заявки")
    views = integer_field(lines, "Просмотры")
    budget = field_after(lines, "Бюджет")
    published = parse_published_at(parser.text)
    current = now or datetime.now(timezone.utc)
    age_days = max(0, (current - published).days) if published else None

    customer_blocked = "аккаунт заказчика блокирован" in text.casefold()
    selected_executor = "выбранный исполнитель" in text.casefold() or bool(
        re.search(r"\b1\s+исполнитель\b", text, re.IGNORECASE)
    )
    registration_required = "авторизуйтесь для подачи заявки" in text.casefold()

    searchable = f"{title} {text}"
    relevant_signals = sorted(name for name, pattern in POSITIVE_PATTERNS.items() if pattern.search(searchable))
    blocking_reasons: list[str] = []
    if status.casefold() != "открыт":
        blocking_reasons.append("not-open")
    if applications is None:
        blocking_reasons.append("applications-unknown")
    elif applications > max_applications:
        blocking_reasons.append("too-many-applications")
    if customer_blocked:
        blocking_reasons.append("customer-blocked")
    if selected_executor:
        blocking_reasons.append("executor-selected")
    if age_days is None:
        blocking_reasons.append("date-unknown")
    elif age_days > max_age_days:
        blocking_reasons.append("older-than-limit")
    if not relevant_signals:
        blocking_reasons.append("not-profile-relevant")

    for reason, pattern in BLOCK_PATTERNS.items():
        if pattern.search(searchable):
            blocking_reasons.append(reason)

    if re.search(r"\bсрочн", title, re.IGNORECASE) and age_days is not None and age_days > 2:
        blocking_reasons.append("stale-urgent-project")
    if re.search(r"строго\s+полная\s+постоплата", searchable, re.IGNORECASE):
        blocking_reasons.append("full-postpayment-only")
    if re.search(r"(?:помощник|аккаунт[- ]?менеджер|менеджер по продажам).*без опыта", searchable, re.IGNORECASE):
        blocking_reasons.append("generic-manager-offer")

    blocking_reasons = sorted(set(blocking_reasons))
    return Opportunity(
        title=title,
        url=url,
        status=status,
        budget=budget,
        applications=applications,
        views=views,
        published_at=published.date().isoformat() if published else None,
        age_days=age_days,
        relevant_signals=relevant_signals,
        blocking_reasons=blocking_reasons,
        customer_blocked=customer_blocked,
        selected_executor=selected_executor,
        registration_required=registration_required,
        actionable=not blocking_reasons,
    )


def scan(max_cards: int, workers: int) -> tuple[list[Opportunity], list[str]]:
    links: set[str] = set()
    errors: list[str] = []
    for category in CATEGORY_URLS:
        try:
            links.update(extract_job_links(read_text(category)))
        except (OSError, UnicodeError, urllib.error.URLError) as exc:
            errors.append(f"category {category}: {exc}")

    selected_links = sorted(links)[:max_cards]
    opportunities: list[Opportunity] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        future_urls = {executor.submit(read_text, url): url for url in selected_links}
        for future in as_completed(future_urls):
            url = future_urls[future]
            try:
                opportunities.append(parse_card(url, future.result()))
            except (OSError, UnicodeError, ValueError, urllib.error.URLError) as exc:
                errors.append(f"card {url}: {exc}")

    opportunities.sort(
        key=lambda item: (
            not item.actionable,
            item.applications if item.applications is not None else 999,
            item.age_days if item.age_days is not None else 999,
            item.title.casefold(),
        )
    )
    return opportunities, errors


def write_outputs(opportunities: list[Opportunity], errors: list[str], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "categories": list(CATEGORY_URLS),
        "opportunities": [asdict(item) for item in opportunities],
        "errors": errors,
    }
    (output_dir / "weblancer-opportunities.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    actionable = [item for item in opportunities if item.actionable]
    lines = [
        "# Weblancer opportunity scan",
        "",
        f"Checked cards: **{len(opportunities)}**, actionable: **{len(actionable)}**, errors: **{len(errors)}**",
        "",
        "| Ready | Applications | Age | Budget | Signals | Blockers | Project |",
        "|---|---:|---:|---:|---|---|---|",
    ]
    for item in opportunities:
        title = item.title.replace("|", "\\|").replace("\n", " ")
        signals = ", ".join(item.relevant_signals) or "—"
        blockers = ", ".join(item.blocking_reasons) or "—"
        applications = item.applications if item.applications is not None else "?"
        age = item.age_days if item.age_days is not None else "?"
        budget = (item.budget or "—").replace("|", "\\|")
        lines.append(
            f"| {'yes' if item.actionable else 'no'} | {applications} | {age} | {budget} | "
            f"{signals} | {blockers} | [{title}]({item.url}) |"
        )
    if errors:
        lines.extend(["", "## Fetch errors", ""] + [f"- {error}" for error in errors])
    (output_dir / "weblancer-opportunities.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Find low-competition Weblancer projects and reject unsafe/stale cards.")
    parser.add_argument("output_dir", nargs="?", default="artifacts/weblancer-opportunity-scan")
    parser.add_argument("--max-cards", type=int, default=100)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    opportunities, errors = scan(max_cards=max(1, args.max_cards), workers=max(1, args.workers))
    write_outputs(opportunities, errors, Path(args.output_dir))
    if not opportunities and errors:
        print("No cards could be checked", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
