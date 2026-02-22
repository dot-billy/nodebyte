#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
MANIFEST="$EXT_DIR/manifest.json"
OUT_DIR="$SCRIPT_DIR/frontend/public/downloads"

VERSION=$(grep -o '"version": *"[^"]*"' "$MANIFEST" | head -1 | cut -d'"' -f4)
NAME=$(grep -o '"name": *"[^"]*"' "$MANIFEST" | head -1 | cut -d'"' -f4)
DESCRIPTION=$(grep -o '"description": *"[^"]*"' "$MANIFEST" | head -1 | cut -d'"' -f4)

if [ -z "$VERSION" ]; then
  echo "Error: could not read version from $MANIFEST"
  exit 1
fi

echo "Building $NAME extension v$VERSION …"

mkdir -p "$OUT_DIR"

ARCHIVE="extension.tar.gz"

if [ -f "$OUT_DIR/$ARCHIVE" ]; then
  TIMESTAMP=$(date +%Y%m%d%H%M%S)
  mv "$OUT_DIR/$ARCHIVE" "$OUT_DIR/extension.$TIMESTAMP.tar.gz"
  echo "  Archived previous build → extension.$TIMESTAMP.tar.gz"
fi

tar -czf "$OUT_DIR/$ARCHIVE" -C "$SCRIPT_DIR" extension
echo "  Created $OUT_DIR/$ARCHIVE"

BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$OUT_DIR/extension-meta.json" <<EOF
{
  "name": "$NAME",
  "version": "$VERSION",
  "description": "$DESCRIPTION",
  "filename": "$ARCHIVE",
  "build_date": "$BUILD_DATE"
}
EOF

echo "  Wrote $OUT_DIR/extension-meta.json"
echo "Done."
