#!/bin/bash
# Build a new version of Focus Buddy and publish it so everyone's app shows the update notice.
#   1. Bump "version" in package.json (e.g. 1.1.0 -> 1.2.0)
#   2. npm run release
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p 'require("./package.json").version')
REPO=$(node -p 'require("./package.json").updateRepo || ""')
ZIP="release/Focus-Buddy-$VERSION-mac-arm64.zip"

npm run package
mkdir -p release
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "dist/Focus Buddy-darwin-arm64/Focus Buddy.app" "$ZIP"
echo "Built $ZIP"

if command -v gh >/dev/null && [ -n "$REPO" ]; then
  gh release create "v$VERSION" "$ZIP" --repo "$REPO" --title "Focus Buddy $VERSION" --generate-notes
  echo "Published v$VERSION to https://github.com/$REPO/releases"
else
  echo
  echo "To publish by hand:"
  echo "  1. Open https://github.com/${REPO:-<you>/<repo>}/releases/new"
  echo "  2. Tag: v$VERSION   Title: Focus Buddy $VERSION"
  echo "  3. Drag in $ZIP and click Publish release"
fi
