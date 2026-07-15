from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path
from typing import Any


BOSS_API = "https://api.boss.dev/rpc/issues/gh/unsolved"


def fetch_bounties() -> list[dict[str, Any]]:
    request = urllib.request.Request(
        BOSS_API,
        headers={"User-Agent": "TerraTectra-Bounty-Scanner/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))
    if not isinstance(data, list):
        raise RuntimeError("Boss.dev API returned a non-list response")
    return [item for item in data if isinstance(item, dict) and item.get("status") == "open"]


def parse_hid(value: object) -> tuple[str, int] | None:
    if not isinstance(value, str) or "#" not in value:
        return None
    repo, number = value.rsplit("#", 1)
    if not repo or not number.isdigit():
        return None
    return repo, int(number)


def normalized(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for item in items:
        parsed = parse_hid(item.get("hId"))
        usd = item.get("usd")
        if parsed is None or not isinstance(usd, (int, float)):
            continue
        repo, number = parsed
        result.append(
            {
                "repo": repo,
                "issue_number": number,
                "title": str(item.get("title") or "(untitled)"),
                "url": str(item.get("url") or f"https://github.com/{repo}/issues/{number}"),
                "usd": float(usd),
            }
        )
    return sorted(result, key=lambda item: (-item["usd"], item["repo"], item["issue_number"]))


def write_outputs(items: list[dict[str, Any]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "boss-bounties.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# Current Boss.dev open bounties",
        "",
        f"Found: **{len(items)}**",
        "",
        "| Reward | Repository | Issue | Title |",
        "|---:|---|---:|---|",
    ]
    for item in items:
        title = item["title"].replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| ${item['usd']:,.0f} | `{item['repo']}` | "
            f"[#{item['issue_number']}]({item['url']}) | {title} |"
        )
    (output_dir / "boss-bounties.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/boss-bounty-scan")
    write_outputs(normalized(fetch_bounties()), output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
