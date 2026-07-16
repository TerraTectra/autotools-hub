from __future__ import annotations

import re
import urllib.parse

import public_task_scan as base


def metric_pair(tokens: list[str]) -> tuple[int | None, int | None]:
    time_index = next((index for index, token in enumerate(tokens) if base.TIME_RE.search(token)), None)
    if time_index is None:
        return None, None

    values: list[int] = []
    for token in tokens[time_index + 1:]:
        if token == "Гонорар":
            break
        value = token.strip()
        if re.fullmatch(r"\d+(?:[\u00a0 ]\d{3})*", value):
            values.append(int(re.sub(r"[\u00a0 ]", "", value)))
    return (values[0], values[1]) if len(values) >= 2 else (None, None)


def parse_page(source: str, max_applications: int, max_age_hours: int) -> list[base.Item]:
    parser = base.Parser()
    parser.feed(source)
    links: list[tuple[int, str, str]] = []
    for position, href, title in parser.links:
        parsed = urllib.parse.urlparse(urllib.parse.urljoin(base.BASE_URL, href))
        if parsed.netloc in {"freelance.ru", "www.freelance.ru"} and base.TASK_PATH.match(parsed.path):
            links.append((position, f"https://freelance.ru{parsed.path}", title))

    items: list[base.Item] = []
    for index, (position, url, title) in enumerate(links):
        previous = links[index - 1][0] if index else 0
        next_position = links[index + 1][0] if index + 1 < len(links) else len(parser.tokens)
        prefix = " ".join(parser.tokens[max(previous, position - 6):position])
        block_tokens = parser.tokens[position:next_position]
        block = " ".join(block_tokens)
        applications, views = metric_pair(block_tokens)
        age = base.age_hours(block)
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
        if not base.PROFILE_RE.search(f"{title} {block}"):
            blockers.append("not-profile")
        if base.BLOCK_RE.search(f"{title} {block}"):
            blockers.append("unsafe-or-off-platform")
        if re.search(r"без опыта|опыт не требуется", block, re.I) and re.search(r"30\s*000|50\s*000|высок\w* оплат", block, re.I):
            blockers.append("suspicious-pay")
        blockers = sorted(set(blockers))
        items.append(base.Item(title, url, applications, views, age, budget, blockers, not blockers))
    return items


base.parse_page = parse_page


if __name__ == "__main__":
    raise SystemExit(base.main())
