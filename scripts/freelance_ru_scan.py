from __future__ import annotations

import argparse
import html
import json
import re
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

BASE_URL = "https://freelance.ru"
TASK_PATH = re.compile(r"^/task/view/\d+/?$")
TIME_RE = re.compile(r"(?:(\d+)\s+(?:минут\w*|час\w*|дн\w*)|день|час)\s+назад", re.I)
PROFILE_RE = re.compile(
    r"python|aiogram|fastapi|node\.?js|typescript|javascript|react|playwright|telegram|телеграм|"
    r"\bapi\b|webhook|парс|excel|xlsx|csv|google sheets|тестирован|\bqa\b|поддержк|автоматизац|скрипт",
    re.I,
)
BLOCK_RE = re.compile(
    r"t\.me/|telegram\.me/|@[a-z0-9_]{5,}|написат\w* отзыв|массов\w* рассыл|сообщен\w* по базе|"
    r"входящ\w* звонк|холодн\w* звонк|созвон|мультиаккаунт|накрут|казино|рулетк",
    re.I,
)


class Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[str] = []
        self.links: list[tuple[int, str, str]] = []
        self.href: str | None = None
        self.anchor: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip += 1
        elif not self.skip and tag == "a":
            self.href = dict(attrs).get("href")
            self.anchor = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip = max(0, self.skip - 1)
        elif not self.skip and tag == "a" and self.href:
            self.links.append((len(self.tokens), self.href, " ".join(self.anchor).strip()))
            self.href = None
            self.anchor = []

    def handle_data(self, data: str) -> None:
        if self.skip:
            return
        value = " ".join(html.unescape(data).split())
        if value:
            self.tokens.append(value)
            if self.href is not None:
                self.anchor.append(value)


@dataclass
class Item:
    title: str
    url: str
    applications: int | None
    views: int | None
    age_hours: int | None
    budget: str | None
    blockers: list[str]
    actionable: bool


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "TerraTectra-Task-Scanner/1.0"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def age_hours(text: str) -> int | None:
    match = TIME_RE.search(text)
    if not match:
        return None
    value = int(match.group(1)) if match.group(1) else 1
    return value * 24 if "д" in match.group(0).casefold() else value


def numbers_after_time(text: str) -> tuple[int | None, int | None]:
    match = TIME_RE.search(text)
    part = text[match.end():].split("Гонорар", 1)[0] if match else text
    part = re.sub(r"Опыт:\s*(?:Не важен|До 1 года|1[–-]3 года|От 3 лет)", " ", part, flags=re.I)
    values = [int(value.replace(" ", "")) for value in re.findall(r"(?<![\w№#])\d[\d ]*(?![\w])", part)]
    return (values[-2], values[-1]) if len(values) >= 2 else (None, None)


def parse_page(source: str, max_applications: int, max_age_hours: int) -> list[Item]:
    parser = Parser()
    parser.feed(source)
    links = []
    for position, href, title in parser.links:
        parsed = urllib.parse.urlparse(urllib.parse.urljoin(BASE_URL, href))
        if parsed.netloc in {"freelance.ru", "www.freelance.ru"} and TASK_PATH.match(parsed.path):
            links.append((position, f"https://freelance.ru{parsed.path}", title))

    items: list[Item] = []
    for index, (position, url, title) in enumerate(links):
        previous = links[index - 1][0] if index else 0
        next_position = links[index + 1][0] if index + 1 < len(links) else len(parser.tokens)
        prefix = " ".join(parser.tokens[max(previous, position - 6):position])
        block = " ".join(parser.tokens[position:next_position])
        applications, views = numbers_after_time(block)
        age = age_hours(block)
        budget = None
        if "Гонорар" in block:
            budget = " ".join(block.split("Гонорар", 1)[1].split("Срок", 1)[0].split())[:100] or None
        blockers: list[str] = []
        if "Видно всем" not in prefix or "Только для Премиум" in prefix:
            blockers.append("not-public")
        if applications is None or applications > max_applications:
            blockers.append("competition")
        if age is None or age > max_age_hours:
            blockers.append("stale")
        if not PROFILE_RE.search(f"{title} {block}"):
            blockers.append("not-profile")
        if BLOCK_RE.search(f"{title} {block}"):
            blockers.append("unsafe-or-off-platform")
        if re.search(r"без опыта|опыт не требуется", block, re.I) and re.search(r"30\s*000|50\s*000|высок\w* оплат", block, re.I):
            blockers.append("suspicious-pay")
        blockers = sorted(set(blockers))
        items.append(Item(title, url, applications, views, age, budget, blockers, not blockers))
    return items


def main() -> int:
    cli = argparse.ArgumentParser()
    cli.add_argument("output_dir", nargs="?", default="artifacts/freelance-ru-scan")
    cli.add_argument("--pages", type=int, default=8)
    cli.add_argument("--max-applications", type=int, default=5)
    cli.add_argument("--max-age-hours", type=int, default=72)
    args = cli.parse_args()

    found: dict[str, Item] = {}
    errors: list[str] = []
    for page in range(1, max(1, args.pages) + 1):
        url = f"{BASE_URL}/task" if page == 1 else f"{BASE_URL}/task?page={page}"
        try:
            for item in parse_page(fetch(url), args.max_applications, args.max_age_hours):
                found[item.url] = item
        except Exception as exc:
            errors.append(f"{url}: {exc}")

    items = sorted(found.values(), key=lambda item: (not item.actionable, item.applications or 999, item.age_hours or 9999))
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    payload = {"generated_at": datetime.now(timezone.utc).isoformat(), "items": [asdict(item) for item in items], "errors": errors}
    (output / "freelance-ru.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ready = [item for item in items if item.actionable]
    lines = ["# Freelance.ru task scan", "", f"Checked: **{len(items)}**, actionable: **{len(ready)}**, errors: **{len(errors)}**", ""]
    for item in items:
        lines.append(f"- {'READY' if item.actionable else 'skip'}: [{item.title}]({item.url}) — {', '.join(item.blockers) or 'manual review'}")
    (output / "freelance-ru.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 1 if not items and errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
