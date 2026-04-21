#!/usr/bin/env bash
# Bump extension + npm versions.
# Canonical version: Makefile (VERSION := x.y.z).
# Usage: scripts/bump-version.sh [patch|minor|major]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUMP="${1:-patch}"
if [[ "$BUMP" != patch && "$BUMP" != minor && "$BUMP" != major ]]; then
  echo "Usage: $0 [patch|minor|major]" >&2
  exit 1
fi

if ! grep -q '^VERSION :=' Makefile; then
  echo "Makefile missing VERSION :=" >&2
  exit 1
fi

CURRENT="$(grep '^VERSION :=' Makefile | sed 's/^VERSION := *//')"
if ! [[ "$CURRENT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "VERSION must be semver x.y.z (got: $CURRENT)" >&2
  exit 1
fi

IFS='.' read -r maj min pat <<<"$CURRENT"
case "$BUMP" in
  major)
    maj=$((maj + 1))
    min=0
    pat=0
    ;;
  minor)
    min=$((min + 1))
    pat=0
    ;;
  patch)
    pat=$((pat + 1))
    ;;
esac

NEW="${maj}.${min}.${pat}"

echo "Bumping $CURRENT -> $NEW ($BUMP)"

perl -i -pe "s/^VERSION := .*/VERSION := $NEW/" Makefile

node <<NODE
const fs = require('fs');
const v = '${NEW}';
for (const rel of [
  'package.json',
  'src/manifest.json',
  'src/manifest.firefox.json',
  'src/manifest.safari.json'
]) {
  const p = rel;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = v;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
const lockPath = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
lock.version = v;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = v;
}
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
NODE

XCODE_PBXPROJ='safari/FontSource.xcodeproj/project.pbxproj'
if [[ -f "$XCODE_PBXPROJ" ]]; then
  CURRENT_BUILD="$(perl -ne 'if (/CURRENT_PROJECT_VERSION = ([0-9]+);/) { print $1; exit }' "$XCODE_PBXPROJ")"
  if [[ -z "$CURRENT_BUILD" || ! "$CURRENT_BUILD" =~ ^[0-9]+$ ]]; then
    echo "Could not determine CURRENT_PROJECT_VERSION from $XCODE_PBXPROJ" >&2
    exit 1
  fi
  NEXT_BUILD=$((CURRENT_BUILD + 1))
  perl -0pi -e "s/MARKETING_VERSION = [0-9]+\\.[0-9]+\\.[0-9]+;/MARKETING_VERSION = $NEW;/g; s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = $NEXT_BUILD;/g" "$XCODE_PBXPROJ"
  echo "Updated Safari Xcode project: MARKETING_VERSION=$NEW CURRENT_PROJECT_VERSION=$NEXT_BUILD"
fi

echo "Done. Review with git diff, then commit and tag if releasing."
