#!/usr/bin/env bash
# Optional App Store / notarization hook. Does not upload unless all vars are set.
# Safari distribution is normally: make package-safari, then Xcode Archive + Transporter.
set -euo pipefail

if [[ -z "${ASC_ISSUER_ID:-}" || -z "${ASC_KEY_ID:-}" || -z "${ASC_KEY_P8:-}" ]]; then
  echo "[publish-safari] Skipping App Store Connect upload (set ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY_P8 to enable)."
  exit 0
fi

echo "[publish-safari] ASC_* credentials are set, but automated macOS upload is not wired in this repo."
echo "[publish-safari] Use Xcode (Product > Archive) and Transporter or xcrun notarytool with your signing setup."
exit 0
