#!/usr/bin/env bash
# Bump extension + npm + Safari Xcode marketing/build versions.
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

PBXPROJ="safari/FontSource/FontSource.xcodeproj/project.pbxproj"
NEXT_BUILD=2
if [[ -f "$PBXPROJ" ]]; then
  CUR_BUILD="$(grep -E 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PBXPROJ" | head -1 | sed -E 's/.*CURRENT_PROJECT_VERSION = ([0-9]+);/\1/')"
  if [[ -n "${CUR_BUILD:-}" ]]; then
    NEXT_BUILD=$((CUR_BUILD + 1))
  fi
fi

echo "Bumping $CURRENT -> $NEW ($BUMP); Xcode CURRENT_PROJECT_VERSION -> $NEXT_BUILD"

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

if [[ -f "$PBXPROJ" ]]; then
  perl -i -pe "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${NEW};/g" "$PBXPROJ"
  perl -i -pe "s/CURRENT_PROJECT_VERSION = \\d+;/CURRENT_PROJECT_VERSION = ${NEXT_BUILD};/g" "$PBXPROJ"
  echo "Updated $PBXPROJ (MARKETING_VERSION=${NEW}, CURRENT_PROJECT_VERSION=${NEXT_BUILD})"
else
  echo "No Xcode project at $PBXPROJ (skipped)."
fi

echo "Done. Review with git diff, then commit and tag if releasing."
