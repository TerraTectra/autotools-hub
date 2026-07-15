#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPONENT="$ROOT/module/classes/components/terratectra_order_telegram"
DIST="$ROOT/dist"
ARCHIVE="$DIST/terratectra_order_telegram-review.tar.gz"

required_files="
$COMPONENT/admin.php
$COMPONENT/install.php
$COMPONENT/class.php
$COMPONENT/events.php
$COMPONENT/permissions.php
$COMPONENT/lang.php
$COMPONENT/i18n.php
$COMPONENT/src/TelegramNotifier.php
$COMPONENT/src/OrderAdapter.php
$ROOT/tests/run.php
"

for file in $required_files; do
  if [ ! -f "$file" ]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

find "$ROOT/module" -name '*.php' -print0 | xargs -0 -n1 php -l >/dev/null
php "$ROOT/tests/run.php"

if grep -R -nE '(bot[0-9]{6,}:[A-Za-z0-9_-]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|password\s*=\s*[^[:space:]]+)' "$ROOT/module" "$ROOT/README.md" 2>/dev/null; then
  echo "Possible secret detected; review output above." >&2
  exit 1
fi

mkdir -p "$DIST"
rm -f "$ARCHIVE"
tar -C "$ROOT/module/classes/components" -czf "$ARCHIVE" terratectra_order_telegram
sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"

echo "Review archive created: $ARCHIVE"
echo "This is not an official UMI.Market exporter package."
