from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


BOSS_API = "https://api.boss.dev/rpc/issues/gh/unsolved"
GITHUB_API = "https://api.github.com"
USER_AGENT = "TerraTectra-Bounty-Scanner/1.1"


def read_json(url: str, *, github: bool = False) -> Any:
    headers = {
        "Accept": "application/vnd.github+json" if github else "application/json",
        "User-Agent": USER_AGENT,
    }
    token = os.getenv("GITHUB_TOKEN") if github else None
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_bounties() -> list[dict[str, Any]]:
    data = read_json(BOSS_API)
    if not isinstance(data, list):
        raise RuntimeError("Boss.dev API returned a non-list response")
    return [item for item in data if isinstance(item, dict) and item.get("status") == "open"]


def parse_hid(value: object) -> tuple[str, int] | None:
    if not isinstance(value, str) or "#" not in value:
        return None
    repo, number = value.rsplit("#", 1)
    if not repo or not number.isdigit() or "/" not in repo:
        return None
    return repo, int(number)


def fetch_github_issue(repo: str, number: int) -> dict[str, Any] | None:
    encoded_repo = "/".join(urllib.parse.quote(part, safe="") for part in repo.split("/", 1))
    try:
        data = read_json(f"{GITHUB_API}/repos/{encoded_repo}/issues/{number}", github=True)
    except urllib.error.HTTPError as exc:
        if exc.code in {404, 410}:
            return None
        raise
    return data if isinstance(data, dict) else None


def normalized(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for item in items:
        parsed = parse_hid(item.get("hId"))
        usd = item.get("usd")
        if parsed is None or not isinstance(usd, (int, float)) or usd <= 0:
            continue
        repo, number = parsed
        issue = fetch_github_issue(repo, number)
        if not issue or issue.get("state") != "open" or "pull_request" in issue:
            continue

        labels = [
            str(label.get("name"))
            for label in issue.get("labels", [])
            if isinstance(label, dict) and label.get("name")
        ]
        assignees = [
            str(user.get("login"))
            for user in issue.get("assignees", [])
            if isinstance(user, dict) and user.get("login")
        ]
        result.append(
            {
                "repo": repo,
                "issue_number": number,
                "title": str(issue.get("title") or item.get("title") or "(untitled)"),
                "url": str(issue.get("html_url") or item.get("url") or f"https://github.com/{repo}/issues/{number}"),
                "usd": float(usd),
                "comments": int(issue.get("comments") or 0),
                "assignees": assignees,
                "labels": labels,
                "created_at": issue.get("created_at"),
                "updated_at": issue.get("updated_at"),
            }
        )
    return sorted(result, key=lambda row: (-row["usd"], row["comments"], row["repo"]))


def write_outputs(items: list[dict[str, Any]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "boss-bounties.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# GitHub-validated Boss.dev open bounties",
        "",
        f"Found: **{len(items)}**",
        "",
        "| Reward | Repository | Issue | Comments | Assigned | Title |",
        "|---:|---|---:|---:|---|---|",
    ]
    for item in items:
        title = item["title"].replace("|", "\\|").replace("\n", " ")
        assigned = ", ".join(item["assignees"]) or "—"
        lines.append(
            f"| ${item['usd']:,.0f} | `{item['repo']}` | "
            f"[#{item['issue_number']}]({item['url']}) | {item['comments']} | "
            f"{assigned} | {title} |"
        )
    (output_dir / "boss-bounties.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/boss-bounty-scan")
    write_outputs(normalized(fetch_bounties()), output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
