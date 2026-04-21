#!/usr/bin/env bash
# Upload a signed macOS .pkg for the Safari host app to App Store Connect.
#
# Required env:
#   SAFARI_PKG_PATH
#   APPLE_ID
#   APPLE_APP_SPECIFIC_PASSWORD
#
# Optional env:
#   APPLE_PROVIDER_PUBLIC_ID
set -euo pipefail

missing=()
for var in SAFARI_PKG_PATH APPLE_ID APPLE_APP_SPECIFIC_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "[publish-safari] Skipping App Store Connect upload (missing: ${missing[*]})"
  exit 0
fi

if [[ ! -f "$SAFARI_PKG_PATH" ]]; then
  echo "[publish-safari] Package not found: $SAFARI_PKG_PATH" >&2
  exit 1
fi

cmd=(
  xcrun altool
  --upload-app
  -f "$SAFARI_PKG_PATH"
  -t osx
  -u "$APPLE_ID"
  -p "$APPLE_APP_SPECIFIC_PASSWORD"
)

if [[ -n "${APPLE_PROVIDER_PUBLIC_ID:-}" ]]; then
  cmd+=(--asc-provider "$APPLE_PROVIDER_PUBLIC_ID")
fi

echo "[publish-safari] Uploading package: $SAFARI_PKG_PATH"
"${cmd[@]}"
echo "[publish-safari] Upload submitted."
