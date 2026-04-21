/**
 * Record or diff panel-listing baseline using Chromium + unpacked extension + local fixture HTTP.
 *
 * Usage:
 *   node tests/panel-baseline-runner.mjs record [--slug=fixture] [--url=http://...]
 *   node tests/panel-baseline-runner.mjs check [--slug=fixture] [--url=http://...]
 *
 * Env:
 *   FONT_SOURCE_PANEL_HEADLESS=1  — try headless (extensions may require headed Chromium; unset = windowed)
 *   FONT_SOURCE_EXT_DIR          — override path to unpacked extension (default: ./dist)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASELINES_DIR = path.join(ROOT, 'tests', 'baselines');
const FIXTURE_FILE = path.join(ROOT, 'tests', 'fixtures', 'panel-scan-page.html');

async function loadFormat() {
  const { formatPanelBaselineFromFonts } = await import('./lib/panel-baseline-format.mjs');
  return formatPanelBaselineFromFonts;
}

function parseArgs(argv) {
  const out = { cmd: '', slug: 'fixture', url: '' };
  for (const a of argv) {
    if (a === 'record' || a === 'check') {
      out.cmd = a;
    } else if (a.startsWith('--slug=')) {
      out.slug = a.slice('--slug='.length).replace(/[^a-zA-Z0-9_-]/g, '') || 'fixture';
    } else if (a.startsWith('--url=')) {
      out.url = a.slice('--url='.length);
    }
  }
  return out;
}

function startFixtureServer(html) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/' || req.url?.startsWith('/?')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('server address'));
        return;
      }
      resolve({ server, port: addr.port, origin: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}

async function runScanWithExtension(extensionAbs, pageUrl) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fontsource-panel-'));
  const headless = process.env.FONT_SOURCE_PANEL_HEADLESS === '1';
  const formatPanelBaselineFromFonts = await loadFormat();

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
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

    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 800));

    /* eslint-disable no-undef -- body runs in extension service worker (chrome.*, globalThis) */
    const scanResult = await serviceWorker.evaluate(async (targetUrl) => {
      const norm = (u) => (u || '').replace(/\/$/, '');
      const targetN = norm(targetUrl);
      const tabs = await chrome.tabs.query({});
      const hit = tabs.find((t) => {
        const u = t.url || '';
        return norm(u) === targetN || u.startsWith(targetUrl);
      });
      if (!hit?.id) {
        const urls = tabs.map((t) => t.url).join('\n');
        throw new Error(`No tab for fixture URL.\nTarget: ${targetUrl}\nOpen tabs:\n${urls}`);
      }
      const run = globalThis.__fontSourceRunScanForTesting;
      if (typeof run !== 'function') {
        throw new Error('Extension test hook missing (__fontSourceRunScanForTesting). Rebuild dist from current src/background.js.');
      }
      return run(hit.id, {});
    }, pageUrl);
    /* eslint-enable no-undef */

    if (!scanResult || scanResult.error) {
      const msg = scanResult?.error || 'Unknown scan error';
      throw new Error(`Scan failed: ${msg}`);
    }
    if (!Array.isArray(scanResult.fonts)) {
      throw new Error('Scan returned no fonts array');
    }

    const snapshot = formatPanelBaselineFromFonts(scanResult.fonts);
    return { snapshot, scanMeta: { url: scanResult.url, count: scanResult.fonts.length } };
  } finally {
    await context?.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const { cmd, slug, url: urlArg } = parseArgs(process.argv.slice(2));
  if (cmd !== 'record' && cmd !== 'check') {
    console.error(
      'Usage: node tests/panel-baseline-runner.mjs <record|check> [--slug=fixture] [--url=http://...]\n'
    );
    process.exit(1);
  }

  const extDir = path.resolve(process.env.FONT_SOURCE_EXT_DIR || path.join(ROOT, 'dist'));
  if (!fs.existsSync(path.join(extDir, 'manifest.json'))) {
    console.error(`Unpacked extension not found at ${extDir} (need manifest.json). Run: make build`);
    process.exit(1);
  }

  const html = fs.readFileSync(FIXTURE_FILE, 'utf8');
  let server = null;
  let pageUrl;
  if (urlArg) {
    pageUrl = urlArg;
  } else {
    const started = await startFixtureServer(html);
    server = started.server;
    pageUrl = `${started.origin}/`;
  }

  try {
    const extensionAbs = extDir;
    const { snapshot, scanMeta } = await runScanWithExtension(extensionAbs, pageUrl);

    fs.mkdirSync(BASELINES_DIR, { recursive: true });
    const baselinePath = path.join(BASELINES_DIR, `${slug}.txt`);

    if (cmd === 'record') {
      fs.writeFileSync(baselinePath, snapshot, 'utf8');
      console.log(`Wrote baseline (${scanMeta.count} fonts, ${scanMeta.url}): ${baselinePath}`);
      return;
    }

    if (!fs.existsSync(baselinePath)) {
      console.error(`Missing baseline file: ${baselinePath}\nRun: node tests/panel-baseline-runner.mjs record --slug=${slug}`);
      process.exit(1);
    }
    const expected = fs.readFileSync(baselinePath, 'utf8');
    if (expected === snapshot) {
      console.log(`Panel baseline OK (${slug}, ${scanMeta.count} fonts).`);
      return;
    }

    console.error(`Panel baseline MISMATCH for slug "${slug}" (${scanMeta.url}).\n`);
    printUnifiedDiff(expected, snapshot);
    process.exit(1);
  } finally {
    server?.close();
  }
}

/**
 * @param {string} expected
 * @param {string} actual
 */
function printUnifiedDiff(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ea = a[i];
    const bb = b[i];
    if (ea !== bb) {
      console.error(`@@ line ${i + 1} @@`);
      if (ea !== undefined) {
        console.error(`-${ea}`);
      }
      if (bb !== undefined) {
        console.error(`+${bb}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
