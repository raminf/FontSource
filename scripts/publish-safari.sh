#!/usr/bin/env bash
# Placeholder for future Safari/macOS App Store automation.
# Today this repo only produces the Safari web-extension source archive from
# make package-safari; it does not build/sign/upload the macOS app wrapper.
set -euo pipefail

if [[ -z "${ASC_ISSUER_ID:-}" || -z "${ASC_KEY_ID:-}" || -z "${ASC_KEY_P8:-}" ]]; then
  echo "[publish-safari] Skipping App Store Connect upload (set ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY_P8 to enable)."
  exit 0
fi

echo "[publish-safari] ASC_* credentials are set, but automated Safari submission is not wired in this repo."
echo "[publish-safari] Apple requires a signed macOS app archive/upload path for App Store delivery."
echo "[publish-safari] Current workflow only emits the Safari web-extension source archive; upload/build/sign manually in Xcode for now."
exit 0
