from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import weblancer_opportunity_scan as base


def read_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": base.USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ru,en;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def job_number(url: str) -> int:
    stem = urllib.parse.urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    tail = stem.rsplit("-", 1)[-1]
    return int(tail) if tail.isdigit() else 0


def scan(max_cards: int, workers: int):
    links: set[str] = set()
    errors: list[str] = []
    for category in base.CATEGORY_URLS:
        try:
            links.update(base.extract_job_links(read_text(category)))
        except (OSError, UnicodeError, TimeoutError, urllib.error.URLError) as exc:
            errors.append(f"category {category}: {exc}")

    selected_links = sorted(links, key=job_number, reverse=True)[:max_cards]
    opportunities = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        future_urls = {executor.submit(read_text, url): url for url in selected_links}
        for future in as_completed(future_urls):
            url = future_urls[future]
            try:
                opportunities.append(base.parse_card(url, future.result()))
            except (OSError, UnicodeError, ValueError, TimeoutError, urllib.error.URLError) as exc:
                errors.append(f"card {url}: {exc}")

    opportunities.sort(
        key=lambda item: (
            not item.actionable,
            item.applications if item.applications is not None else 999,
            item.age_days if item.age_days is not None else 999,
            -job_number(item.url),
        )
    )
    return opportunities, errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Fast recent-card Weblancer opportunity scan.")
    parser.add_argument("output_dir", nargs="?", default="artifacts/weblancer-opportunity-scan")
    parser.add_argument("--max-cards", type=int, default=48)
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

    opportunities, errors = scan(max(1, args.max_cards), max(1, args.workers))
    base.write_outputs(opportunities, errors, Path(args.output_dir))
    if not opportunities and errors:
        print("No cards could be checked", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
