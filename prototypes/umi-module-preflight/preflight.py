#!/usr/bin/env python3
"""Static preflight checks for UMI.CMS component packages.

This tool does not replace testing on an NFR installation or official UMI.Market
moderation. It catches common packaging, syntax, and disclosure mistakes before
those stages.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    message: str
    path: str | None = None


@dataclass(frozen=True)
class Report:
    root: str
    module_name: str | None
    errors: int
    warnings: int
    notes: int
    findings: list[Finding]

    @property
    def ok(self) -> bool:
        return self.errors == 0


TEXT_SUFFIXES = {".php", ".md", ".txt", ".json", ".xml", ".yml", ".yaml", ".ini", ".env"}
SUSPICIOUS_FILENAMES = {
    ".env",
    "database.sql",
    "dump.sql",
    "backup.sql",
    "config.local.php",
    "id_rsa",
    "id_ed25519",
}


def rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


def iter_text_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() in TEXT_SUFFIXES or path.name in SUSPICIOUS_FILENAMES:
            yield path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig", errors="replace")


def parse_module_name(install_text: str) -> str | None:
    match = re.search(r"['\"]name['\"]\s*=>\s*['\"]([^'\"]+)['\"]", install_text)
    return match.group(1).strip() if match else None


def parse_config_flag(install_text: str) -> str | None:
    match = re.search(r"['\"]config['\"]\s*=>\s*['\"]?([01])['\"]?", install_text)
    return match.group(1) if match else None


def parse_components(install_text: str) -> list[str]:
    module_dir_match = re.search(r"\$moduleDir\s*=\s*['\"]([^'\"]+)['\"]", install_text)
    module_dir = module_dir_match.group(1) if module_dir_match else ""
    components_block = re.search(r"\$COMPONENTS\s*=\s*\[(.*?)\];", install_text, re.S)
    if not components_block:
        return []
    block = components_block.group(1)
    results: list[str] = []
    for prefix, direct in re.findall(
        r"(?:\$moduleDir\s*\.\s*['\"]([^'\"]+)['\"]|['\"]([^'\"]+\.php)['\"])",
        block,
    ):
        value = f"{module_dir}{prefix}" if prefix else direct
        results.append(value.replace("\\", "/"))
    return results


def resolve_component(root: Path, install_path: Path, declared: str) -> Path:
    cleaned = declared.strip().replace("\\", "/")
    if cleaned.startswith("./"):
        candidate = root / cleaned[2:]
        if candidate.exists():
            return candidate
    candidate = install_path.parent / cleaned
    if candidate.exists():
        return candidate
    return root / cleaned.lstrip("/")


def php_lint(files: list[Path], root: Path) -> list[Finding]:
    php = shutil.which("php")
    if php is None:
        return [Finding("warning", "php-not-found", "PHP CLI is unavailable; syntax lint was skipped.")]
    findings: list[Finding] = []
    for path in files:
        proc = subprocess.run([php, "-l", str(path)], capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            message = (proc.stderr or proc.stdout).strip().splitlines()[-1]
            findings.append(Finding("error", "php-syntax", message, rel(path, root)))
    if not findings:
        findings.append(Finding("note", "php-syntax-ok", f"PHP syntax is valid in {len(files)} file(s)."))
    return findings


def inspect(root: Path) -> Report:
    root = root.resolve()
    findings: list[Finding] = []
    if not root.exists() or not root.is_dir():
        findings.append(Finding("error", "root-missing", "The supplied module directory does not exist.", str(root)))
        return build_report(root, None, findings)

    install_candidates = sorted(root.rglob("install.php"), key=lambda p: (len(p.parts), str(p)))
    if not install_candidates:
        findings.append(Finding("error", "install-missing", "No install.php manifest was found."))
        return build_report(root, None, findings)
    install_path = install_candidates[0]
    if len(install_candidates) > 1:
        findings.append(
            Finding(
                "warning",
                "multiple-install-files",
                f"Found {len(install_candidates)} install.php files; inspected the shortest path.",
                rel(install_path, root),
            )
        )

    install_text = read_text(install_path)
    module_name = parse_module_name(install_text)
    if module_name:
        findings.append(Finding("note", "module-name", f"Module name: {module_name}."))
    else:
        findings.append(Finding("error", "module-name-missing", "The $INFO name field was not found.", rel(install_path, root)))

    config_flag = parse_config_flag(install_text)
    if config_flag is None:
        findings.append(Finding("warning", "config-flag-missing", "The $INFO config flag was not found.", rel(install_path, root)))
    elif config_flag == "1":
        if not re.search(r"['\"]default_method_admin['\"]\s*=>\s*['\"][^'\"]+['\"]", install_text):
            findings.append(
                Finding(
                    "error",
                    "admin-method-missing",
                    "config=1 but default_method_admin is not declared.",
                    rel(install_path, root),
                )
            )
        if not (install_path.parent / "admin.php").exists():
            findings.append(
                Finding(
                    "error",
                    "admin-file-missing",
                    "config=1 but admin.php is missing beside install.php.",
                    rel(install_path.parent, root),
                )
            )

    declared_components = parse_components(install_text)
    if not declared_components:
        findings.append(Finding("warning", "components-empty", "No PHP files were parsed from $COMPONENTS.", rel(install_path, root)))
    else:
        missing = []
        for declared in declared_components:
            target = resolve_component(root, install_path, declared)
            if not target.exists():
                missing.append(declared)
        if missing:
            for declared in missing:
                findings.append(Finding("error", "component-missing", f"Declared component does not exist: {declared}", rel(install_path, root)))
        else:
            findings.append(Finding("note", "components-ok", f"All {len(declared_components)} declared component(s) exist."))

    for expected in ("class.php", "permissions.php", "lang.php", "i18n.php"):
        if not (install_path.parent / expected).exists():
            findings.append(Finding("warning", "common-file-missing", f"Common component file is absent: {expected}", rel(install_path.parent, root)))

    events_path = install_path.parent / "events.php"
    if events_path.exists():
        listener_count = len(re.findall(r"\bnew\s+umiEventListener\s*\(", read_text(events_path)))
        if listener_count:
            findings.append(Finding("note", "event-listeners", f"Found {listener_count} event listener registration(s).", rel(events_path, root)))
        else:
            findings.append(Finding("warning", "event-file-empty", "events.php exists but no umiEventListener registration was detected.", rel(events_path, root)))

    php_files = sorted(root.rglob("*.php"))
    findings.extend(php_lint(php_files, root))

    for path in iter_text_files(root):
        relative = rel(path, root)
        if path.name in SUSPICIOUS_FILENAMES:
            findings.append(Finding("error", "sensitive-file", f"Potentially sensitive file is included: {path.name}", relative))
        raw = path.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            findings.append(Finding("warning", "utf8-bom", "UTF-8 BOM detected; use UTF-8 without BOM for predictable PHP output.", relative))

    for pattern in ("*.zip", "*.tar", "*.tar.gz", "*.tgz", "*.bak", "*.sql"):
        for path in root.rglob(pattern):
            if path.is_file():
                findings.append(Finding("warning", "bundled-artifact", f"Review bundled artifact before distribution: {path.name}", rel(path, root)))

    readme = next((p for p in (root / "README.md", install_path.parent / "README.md") if p.exists()), None)
    if readme is None:
        findings.append(Finding("warning", "readme-missing", "README.md with installation and support instructions was not found."))
    else:
        findings.append(Finding("note", "readme-found", "README.md is present.", rel(readme, root)))

    return build_report(root, module_name, findings)


def build_report(root: Path, module_name: str | None, findings: list[Finding]) -> Report:
    counts = {level: sum(f.severity == level for f in findings) for level in ("error", "warning", "note")}
    return Report(
        root=str(root),
        module_name=module_name,
        errors=counts["error"],
        warnings=counts["warning"],
        notes=counts["note"],
        findings=findings,
    )


def format_text(report: Report) -> str:
    lines = [
        "UMI.CMS Module Preflight",
        f"Root: {report.root}",
        f"Module: {report.module_name or 'unknown'}",
        f"Result: {report.errors} error(s), {report.warnings} warning(s), {report.notes} note(s)",
        "",
    ]
    icons = {"error": "ERROR", "warning": "WARN", "note": "INFO"}
    for finding in report.findings:
        suffix = f" [{finding.path}]" if finding.path else ""
        lines.append(f"{icons[finding.severity]} {finding.code}: {finding.message}{suffix}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Static preflight for UMI.CMS module packages.")
    parser.add_argument("path", type=Path, help="Module/package directory to inspect")
    parser.add_argument("--json", dest="json_path", type=Path, help="Write a JSON report to this path")
    parser.add_argument("--strict", action="store_true", help="Return a failure exit code when warnings exist")
    args = parser.parse_args(argv)

    report = inspect(args.path)
    print(format_text(report))
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        payload = asdict(report) | {"ok": report.ok}
        args.json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if report.errors:
        return 2
    if args.strict and report.warnings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
