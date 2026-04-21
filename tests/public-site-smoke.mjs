/**
 * End-to-end smoke: unpacked extension + Chromium + real public HTTPS pages.
 *
 * Catches regressions where scans attach to the wrong tab, return before the
 * content script is ready, or drop font payload fields.
 *
 * Usage:
 *   npm run test:panel:public
 *
 * Requires ./artifacts/chrome/manifest.json (build the extension first).
 *
 * Env:
 *   FONT_SOURCE_PANEL_HEADLESS=1
 *   FONT_SOURCE_EXT_DIR=/path/to/unpacked
 *   FONT_SOURCE_SKIP_PUBLIC_SITES=1  — exit 0 without running (e.g. offline CI)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createExtensionPlaywrightContext,
  executeFontScanInServiceWorker,
  assertScanSuccess,
  runExtensionFontScan
} from './lib/extension-scan-harness.mjs';
import {
  assertFontScanPayload,
  assertUrlHostContains
} from './lib/assert-font-scan-result.mjs';
import { PUBLIC_SITE_SMOKE_CASES, withSmokeTabHash } from './lib/public-site-cases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function main() {
  if (process.env.FONT_SOURCE_SKIP_PUBLIC_SITES === '1') {
    console.log('Skipping public site smoke (FONT_SOURCE_SKIP_PUBLIC_SITES=1).');
    return;
  }

  const extDir = path.resolve(process.env.FONT_SOURCE_EXT_DIR || path.join(ROOT, 'artifacts', 'chrome'));
  if (!fs.existsSync(path.join(extDir, 'manifest.json'))) {
    console.error(`Unpacked extension not found at ${extDir} (need manifest.json). Build first.`);
    process.exit(1);
  }

  for (const site of PUBLIC_SITE_SMOKE_CASES) {
    const pageUrl = withSmokeTabHash(site.startUrl);
    const waitUntil = site.waitUntil ?? 'domcontentloaded';
    const settleMs = site.settleMs ?? 900;
    const gotoTimeout = 90000;

    process.stdout.write(`[public-site] ${site.id} … `);

    const { fonts, url } = await runExtensionFontScan(extDir, pageUrl, {
      waitUntil,
      settleMs,
      gotoTimeout
    });

    assertUrlHostContains(url, site.hostContains);
    assertFontScanPayload(fonts, {
      minFontFamilies: site.minFontFamilies,
      minFontsWithUsageSamples: site.minFontsWithUsageSamples ?? 1
    });

    const urlShort = url.length > 88 ? `${url.slice(0, 88)}…` : url;
    console.log(`OK (${fonts.length} families, ${urlShort})`);
  }

  await runMultiTabDisambiguationSmoke(extDir);
  console.log('All public site smoke checks passed.');
}

/**
 * Two real tabs with different hashes; the non-focused tab must still scan by URL
 * (tab id resolution), not whatever tab happens to be active.
 */
async function runMultiTabDisambiguationSmoke(extensionAbs) {
  process.stdout.write('[public-site] multi_tab_disambiguation … ');

  const handle = await createExtensionPlaywrightContext(extensionAbs);
  try {
    const p1 = await handle.context.newPage();
    const url1 = withSmokeTabHash('https://example.com/');
    await p1.goto(url1, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 500));

    const p2 = await handle.context.newPage();
    const url2 = withSmokeTabHash('https://example.com/');
    await p2.goto(url2, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 500));

    await p2.bringToFront();
    await new Promise((r) => setTimeout(r, 200));

    const rawA = await executeFontScanInServiceWorker(handle.serviceWorker, url1);
    const scanA = assertScanSuccess(rawA);
    if (!String(scanA.url || '').includes('fontsource-smoke=')) {
      throw new Error(`expected tab A URL to retain smoke hash, got ${scanA.url}`);
    }
    assertUrlHostContains(scanA.url, 'example.com');
    assertFontScanPayload(scanA.fonts, { minFontFamilies: 1, minFontsWithUsageSamples: 1 });

    await p1.bringToFront();
    await new Promise((r) => setTimeout(r, 150));

    const rawB = await executeFontScanInServiceWorker(handle.serviceWorker, url2);
    const scanB = assertScanSuccess(rawB);
    if (scanA.url === scanB.url) {
      throw new Error('expected distinct tab URLs for two hashes');
    }
    assertUrlHostContains(scanB.url, 'example.com');
    assertFontScanPayload(scanB.fonts, { minFontFamilies: 1, minFontsWithUsageSamples: 1 });

    console.log('OK');
  } finally {
    await handle.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
