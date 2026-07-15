from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BOSS_API = "https://api.boss.dev/rpc/issues/gh/unsolved"
GITHUB_API = "https://api.github.com"
USER_AGENT = "TerraTectra-Bounty-Scanner/1.2"
CLAIM_PATTERNS = (
    re.compile(r"/boss\s+(?:onit|champion)", re.IGNORECASE),
    re.compile(r"\bopened\s+(?:a\s+)?pr\b", re.IGNORECASE),
    re.compile(r"\bimplementation\s+complete\b", re.IGNORECASE),
    re.compile(r"github\.com/[^\s)]+/pull/\d+", re.IGNORECASE),
)


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


def repo_api_path(repo: str) -> str:
    return "/".join(urllib.parse.quote(part, safe="") for part in repo.split("/", 1))


def fetch_github_issue(repo: str, number: int) -> dict[str, Any] | None:
    try:
        data = read_json(f"{GITHUB_API}/repos/{repo_api_path(repo)}/issues/{number}", github=True)
    except urllib.error.HTTPError as exc:
        if exc.code in {404, 410}:
            return None
        raise
    return data if isinstance(data, dict) else None


def fetch_comment_bodies(repo: str, number: int) -> list[str]:
    try:
        data = read_json(
            f"{GITHUB_API}/repos/{repo_api_path(repo)}/issues/{number}/comments?per_page=100",
            github=True,
        )
    except urllib.error.HTTPError:
        return []
    if not isinstance(data, list):
        return []
    return [str(item.get("body") or "") for item in data if isinstance(item, dict)]


def age_days(created_at: object) -> int | None:
    if not isinstance(created_at, str):
        return None
    try:
        created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    return max(0, (datetime.now(timezone.utc) - created).days)


def detect_claim_signals(bodies: list[str]) -> list[str]:
    signals: set[str] = set()
    for body in bodies:
        if CLAIM_PATTERNS[0].search(body):
            signals.add("boss-claim-command")
        if CLAIM_PATTERNS[1].search(body) or CLAIM_PATTERNS[3].search(body):
            signals.add("pull-request-mentioned")
        if CLAIM_PATTERNS[2].search(body):
            signals.add("implementation-complete")
    return sorted(signals)


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
        claim_signals = detect_claim_signals(fetch_comment_bodies(repo, number))
        issue_age = age_days(issue.get("created_at"))
        blocking_reasons: list[str] = []
        if assignees:
            blocking_reasons.append("assigned")
        if any(label.casefold() == "to refine" for label in labels):
            blocking_reasons.append("to-refine")
        if claim_signals:
            blocking_reasons.append("claim-or-pr-found")
        if issue_age is not None and issue_age > 180:
            blocking_reasons.append("older-than-180-days")
        if repo.casefold().endswith("/boss-demo"):
            blocking_reasons.append("demo-repository")

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
                "age_days": issue_age,
                "claim_signals": claim_signals,
                "blocking_reasons": blocking_reasons,
                "actionable": not blocking_reasons,
                "created_at": issue.get("created_at"),
                "updated_at": issue.get("updated_at"),
            }
        )
    return sorted(
        result,
        key=lambda row: (
            not row["actionable"],
            -row["usd"],
            row["comments"],
            row["repo"],
        ),
    )


def write_outputs(items: list[dict[str, Any]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "boss-bounties.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    actionable_count = sum(1 for item in items if item["actionable"])
    lines = [
        "# GitHub-validated Boss.dev open bounties",
        "",
        f"Found: **{len(items)}**, actionable: **{actionable_count}**",
        "",
        "| Ready | Reward | Repository | Issue | Comments | Age | Blockers | Title |",
        "|---|---:|---|---:|---:|---:|---|---|",
    ]
    for item in items:
        title = item["title"].replace("|", "\\|").replace("\n", " ")
        blockers = ", ".join(item["blocking_reasons"]) or "—"
        age = item["age_days"] if item["age_days"] is not None else "?"
        lines.append(
            f"| {'yes' if item['actionable'] else 'no'} | ${item['usd']:,.0f} | `{item['repo']}` | "
            f"[#{item['issue_number']}]({item['url']}) | {item['comments']} | {age} | "
            f"{blockers} | {title} |"
        )
    (output_dir / "boss-bounties.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/boss-bounty-scan")
    write_outputs(normalized(fetch_bounties()), output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
