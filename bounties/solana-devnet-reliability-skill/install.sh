#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Install Solana Devnet Reliability Skill

Usage:
  ./install.sh             Install for the current user
  ./install.sh --project   Install into the current project
  ./install.sh --target PATH
  ./install.sh --help

The installer copies documentation and agent command files only. It does not
create wallets, install binaries, request funds, or modify Solana configuration.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${HOME}/.claude/skills/solana-devnet-reliability"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      TARGET="$(pwd)/.claude/skills/solana-devnet-reliability"
      shift
      ;;
    --target)
      [[ $# -ge 2 ]] || { echo "--target requires a path" >&2; exit 2; }
      TARGET="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${TARGET}" || "${TARGET}" == "/" ]]; then
  echo "Refusing unsafe target path." >&2
  exit 2
fi

mkdir -p "${TARGET}"

copy_dir() {
  local source="$1"
  local destination="$2"
  [[ -d "${source}" ]] || { echo "Missing source directory: ${source}" >&2; exit 1; }
  mkdir -p "${destination}"
  cp -R "${source}/." "${destination}/"
}

copy_dir "${SCRIPT_DIR}/skill" "${TARGET}/skill"
copy_dir "${SCRIPT_DIR}/commands" "${TARGET}/commands"
copy_dir "${SCRIPT_DIR}/agents" "${TARGET}/agents"
copy_dir "${SCRIPT_DIR}/scripts" "${TARGET}/scripts"

cp "${SCRIPT_DIR}/README.md" "${TARGET}/README.md"
cp "${SCRIPT_DIR}/package.json" "${TARGET}/package.json"

chmod -R u+rwX,go-rwx "${TARGET}" 2>/dev/null || true
chmod u+x "${TARGET}/scripts/devnet-doctor.mjs" 2>/dev/null || true

cat <<EOF
Installed Solana Devnet Reliability Skill to:
  ${TARGET}

Read-only doctor example:
  node "${TARGET}/scripts/devnet-doctor.mjs" --address <PUBLIC_KEY> --json
EOF
