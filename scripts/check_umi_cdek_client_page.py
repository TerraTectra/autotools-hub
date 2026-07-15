from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.external_urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        element_id = values.get("id")
        if element_id:
            self.ids.add(element_id)

        for name in ("href", "src"):
            value = values.get(name)
            if value and value.startswith(("http://", "https://", "mailto:")):
                self.external_urls.append(value)


def validate(path: Path) -> list[str]:
    if not path.is_file():
        return [f"Page does not exist: {path}"]

    text = path.read_text(encoding="utf-8")
    lower = text.lower()
    errors: list[str] = []

    required = {
        "doctype": "<!doctype html>",
        "UMI.CMS": "umi.cms",
        "CDEK": "сдэк",
        "questionnaire": 'id="checklist"',
        "web studio handoff": "веб-студ",
    }
    for label, value in required.items():
        if value not in lower:
            errors.append(f"Missing required element: {label}")

    forbidden = {
        "direct email link": "mailto:",
        "direct Telegram link": "t.me/",
        "developer Telegram handle": "@tahioff",
        "developer email": "nikidom123",
        "rouble symbol": "₽",
        "contractor base price": "20 000",
        "contractor expanded price": "35 000",
        "contractor agency price": "55 000",
    }
    for label, value in forbidden.items():
        if value in lower:
            errors.append(f"Forbidden white-label content: {label}")

    parser = PageParser()
    parser.feed(text)
    if "checklist" not in parser.ids:
        errors.append("Questionnaire block has no checklist id")
    if parser.external_urls:
        errors.append("External URLs are not allowed: " + ", ".join(parser.external_urls))

    return errors


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("site/umi-cdek-client.html")
    errors = validate(path)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(f"OK: {path} is suitable for white-label client sharing")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
