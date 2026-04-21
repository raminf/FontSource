/**
 * Submit the unpacked extension in artifacts/firefox/ to AMO (listed) via web-ext.
 * Exits 0 without submitting when required env vars are missing.
 *
 * Expects artifacts/firefox/ to already use the Firefox MV2 manifest (run make package-firefox first).
 *
 * Env: WEB_EXT_API_KEY, WEB_EXT_API_SECRET (Mozilla JWT issuer + secret from AMO)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

function defined(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

if (!defined('WEB_EXT_API_KEY') || !defined('WEB_EXT_API_SECRET')) {
  console.log('[publish-firefox] Skipping AMO submit (missing WEB_EXT_API_KEY or WEB_EXT_API_SECRET)');
  process.exit(0);
}

const dist = 'artifacts/firefox';
if (!fs.existsSync(dist) || !fs.existsSync(`${dist}/manifest.json`)) {
  console.error(
    '[publish-firefox] artifacts/firefox/ or manifest.json missing. Run make package-firefox first.'
  );
  process.exit(1);
}

const artifactsDir = 'firefox-artifacts';
fs.mkdirSync(artifactsDir, { recursive: true });

const r = spawnSync(
  'npx',
  ['web-ext', 'sign', '--channel', 'listed', '--source-dir', dist, '--artifacts-dir', artifactsDir],
  {
    stdio: 'inherit',
    env: process.env,
    shell: false
  }
);

if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

console.log('[publish-firefox] web-ext sign finished (see', artifactsDir, ')');
