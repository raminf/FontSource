/**
 * Playwright + unpacked MV3 extension helpers for integration scans.
 * Used by panel-baseline-runner and public-site-smoke tests.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * @param {string} extensionAbs absolute path to unpacked extension (artifacts/chrome/)
 * @returns {Promise<{ context: import('playwright').BrowserContext, serviceWorker: import('playwright').Worker, userDataDir: string, dispose: () => Promise<void> }>}
 */
export async function createExtensionPlaywrightContext(extensionAbs) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fontsource-panel-'));
  const headless = process.env.FONT_SOURCE_PANEL_HEADLESS === '1';

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless,
    args: [
      `--disable-extensions-except=${extensionAbs}`,
      `--load-extension=${extensionAbs}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const serviceWorker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker', { timeout: 45000 }));

  return {
    context,
    serviceWorker,
    userDataDir,
    async dispose() {
      await context.close().catch(() => {});
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  };
}

/**
 * Resolve the tab that matches targetUrl and run the extension test scan hook.
 * Prefers the active tab among multiple URL matches so Playwright's focused page wins
 * when URLs only differ by hash/query.
 *
 * @param {import('playwright').Worker} serviceWorker
 * @param {string} targetUrl
 * @returns {Promise<object>}
 */
export async function executeFontScanInServiceWorker(serviceWorker, targetUrl) {
  /* eslint-disable no-undef -- evaluated in extension service worker */
  return serviceWorker.evaluate(async (targetUrlInner) => {
    const stripTrailingSlash = (u) => String(u || '').replace(/\/$/, '');

    const tabs = await chrome.tabs.query({});
    const matches = tabs.filter((t) => {
      const u = t.url || '';
      if (!u) {
        return false;
      }
      if (u === targetUrlInner) {
        return true;
      }
      if (stripTrailingSlash(u) === stripTrailingSlash(targetUrlInner)) {
        return true;
      }
      if (u.startsWith(targetUrlInner)) {
        return true;
      }
      return false;
    });

    const hit =
      matches.find((t) => t.active) ||
      matches.find((t) => t.highlighted) ||
      matches[0];

    if (!hit?.id) {
      const lines = tabs.map((t) => `${t.id} active=${t.active} ${t.url}`).join('\n');
      throw new Error(`No tab for URL.\nTarget: ${targetUrlInner}\nTabs:\n${lines}`);
    }

    const run = globalThis.__fontSourceRunScanForTesting;
    if (typeof run !== 'function') {
      throw new Error(
        'Extension test hook missing (__fontSourceRunScanForTesting). Rebuild artifacts/chrome from current src/background.js.'
      );
    }

    return run(hit.id, {});
  }, targetUrl);
  /* eslint-enable no-undef */
}

/**
 * @param {unknown} scanResult
 * @returns {{ fonts: object[], url: string }}
 */
export function assertScanSuccess(scanResult) {
  if (!scanResult || typeof scanResult !== 'object') {
    throw new Error('Scan returned empty result');
  }
  const err = /** @type {{ error?: string }} */ (scanResult).error;
  if (typeof err === 'string' && err.length > 0) {
    throw new Error(`Scan failed: ${err}`);
  }
  const fonts = /** @type {{ fonts?: unknown }} */ (scanResult).fonts;
  if (!Array.isArray(fonts)) {
    throw new Error('Scan returned no fonts array');
  }
  const url = /** @type {{ url?: unknown }} */ (scanResult).url;
  return {
    fonts,
    url: typeof url === 'string' ? url : ''
  };
}

/**
 * Open targetUrl in a new tab, wait, then scan that tab by URL (not "last active" heuristics alone).
 *
 * @param {string} extensionAbs
 * @param {string} pageUrl
 * @param {{ settleMs?: number, waitUntil?: 'domcontentloaded' | 'load' | 'networkidle', gotoTimeout?: number }} [options]
 * @returns {Promise<{ fonts: object[], url: string, raw: object }>}
 */
export async function runExtensionFontScan(extensionAbs, pageUrl, options = {}) {
  const settleMs = options.settleMs ?? 800;
  const waitUntil = options.waitUntil ?? 'domcontentloaded';
  const gotoTimeout = options.gotoTimeout ?? 60000;

  const handle = await createExtensionPlaywrightContext(extensionAbs);
  try {
    const page = await handle.context.newPage();
    await page.bringToFront();
    await page.goto(pageUrl, { waitUntil, timeout: gotoTimeout });
    await new Promise((r) => setTimeout(r, settleMs));

    const raw = await executeFontScanInServiceWorker(handle.serviceWorker, pageUrl);
    const { fonts, url } = assertScanSuccess(raw);
    return { fonts, url, raw };
  } finally {
    await handle.dispose();
  }
}
