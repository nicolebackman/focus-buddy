#!/bin/bash
# Build a new version of Focus Buddy and publish it so everyone's app shows the update notice.
#   1. Bump "version" in package.json (e.g. 1.1.0 -> 1.2.0)
#   2. npm run release
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p 'require("./package.json").version')
REPO=$(node -p 'require("./package.json").updateRepo || ""')
ZIP="release/Focus-Buddy-$VERSION-mac-arm64.zip"
APP="dist/Focus Buddy-darwin-arm64/Focus Buddy.app"

npm run package
# Give the whole app a valid ad-hoc signature. Packager only re-signs the Electron framework, which
# leaves the app's own signature broken, and macOS calls a downloaded copy "damaged" with no way to open it.
# Signed like this, people can open it once via System Settings > Privacy & Security > Open Anyway.
# (Opening with no warning at all needs a paid Apple Developer ID certificate and notarization.)
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
mkdir -p release
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
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
