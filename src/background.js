/**
 * Background Script
 * Manages extension state, handles messages, and coordinates between components
 */

/**
 * Firefox MV2 uses a non-worker background page (no importScripts). Chrome and
 * Safari MV3 builds use a service worker where importScripts is available.
 */
function isFirefoxMv2BackgroundRuntime() {
  return typeof importScripts !== 'function';
}

(function loadFontFaceRemoteParser() {
  if (isFirefoxMv2BackgroundRuntime()) {
    /* Firefox only: manifest.firefox.json lists lib/font-face-remote.js before background.js. */
    if (typeof globalThis.parseFontFacesFromCss !== 'function') {
      console.error(
        'FontSource: parseFontFacesFromCss missing; manifest.firefox.json must load lib/font-face-remote.js before background.js.'
      );
    }
    return;
  }
  /* Chrome / Safari MV3 service worker */
  if (typeof globalThis.parseFontFacesFromCss === 'function') {
    return;
  }
  const url =
    typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL('lib/font-face-remote.js')
      : 'lib/font-face-remote.js';
  importScripts(url);
})();

/**
 * Chrome/Safari MV3 service worker: lastFocusedWindow finds the tab behind the toolbar popup.
 * Firefox MV2 persistent background: currentWindow matches the user’s browser window reliably.
 */
function activeTabQueryOpts() {
  return isFirefoxMv2BackgroundRuntime()
    ? { active: true, currentWindow: true }
    : { active: true, lastFocusedWindow: true };
}

function tabsQuery(query, callback) {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
    callback([]);
    return;
  }
  try {
    chrome.tabs.query(query, (tabs) => {
      if (chrome.runtime.lastError) {
        console.warn('FontSource: tabs.query', chrome.runtime.lastError.message);
        callback([]);
        return;
      }
      callback(tabs || []);
    });
  } catch (e) {
    console.warn('FontSource: tabs.query threw', e);
    callback([]);
  }
}

const DEFAULT_FIND_SEARCH_TEMPLATE = 'https://www.google.com/search?q={query}';
const FIREFOX_RESTRICTED_HOSTS = new Set([
  'accounts-static.cdn.mozilla.net',
  'accounts.firefox.com',
  'addons.cdn.mozilla.net',
  'addons.mozilla.org',
  'api.accounts.firefox.com',
  'content.cdn.mozilla.net',
  'discovery.addons.mozilla.org',
  'install.mozilla.org',
  'oauth.accounts.firefox.com',
  'profile.accounts.firefox.com',
  'support.mozilla.org',
  'sync.services.mozilla.com'
]);

// Extension state
let state = {
  scanOptions: {
    scanRoot: false
  },
  showPreview: true,
  groupBySource: false,
  findSearchUrlTemplate: DEFAULT_FIND_SEARCH_TEMPLATE
};

/** Popup port for live font-scan progress (content → background → popup). */
let fontScanProgressPort = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'fontScanProgress') {
    return;
  }
  fontScanProgressPort = port;
  port.onDisconnect.addListener(() => {
    fontScanProgressPort = null;
  });
});

function normalizeFindSearchTemplate(t) {
  const s = String(t || '').trim();
  if (!s.includes('{query}')) {
    return DEFAULT_FIND_SEARCH_TEMPLATE;
  }
  try {
    const probe = s.replace('{query}', 'x');
    const u = new URL(probe);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return DEFAULT_FIND_SEARCH_TEMPLATE;
    }
  } catch {
    return DEFAULT_FIND_SEARCH_TEMPLATE;
  }
  return s.slice(0, 800);
}

// Load state from storage
function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['scanOptions', 'showPreview', 'groupBySource', 'findSearchUrlTemplate'],
      (result) => {
        if (result.scanOptions) {
          state.scanOptions = result.scanOptions;
        }
        if (typeof result.showPreview === 'boolean') {
          state.showPreview = result.showPreview;
        }
        if (typeof result.groupBySource === 'boolean') {
          state.groupBySource = result.groupBySource;
        }
        if (typeof result.findSearchUrlTemplate === 'string') {
          state.findSearchUrlTemplate = normalizeFindSearchTemplate(result.findSearchUrlTemplate);
        }
        chrome.storage.local.remove('recentUrls');
        resolve(state);
      }
    );
  });
}

// Save state to storage
function saveState() {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        scanOptions: state.scanOptions,
        showPreview: state.showPreview,
        groupBySource: state.groupBySource,
        findSearchUrlTemplate: state.findSearchUrlTemplate
      },
      () => {
        resolve();
      }
    );
  });
}

// Update scan options
function updateScanOptions(options) {
  state.scanOptions = { ...state.scanOptions, ...options };
  saveState();
  return state.scanOptions;
}

/**
 * Firefox-only: when lastFocusedWindow + active misses (toolbar popup focus),
 * pick a scannable tab from active tabs across windows. Not used on Chrome/Safari MV3.
 * @param {(tab: object | null) => void} callback
 */
function pickActiveTabAcrossWindowsFirefox(callback) {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
    callback(null);
    return;
  }
  try {
    tabsQuery({ active: true }, (tabs) => {
      if (!tabs || !tabs.length) {
        callback(null);
        return;
      }
      const scannable = tabs.find((t) => t.url && isScannablePage(t.url));
      callback(scannable || tabs[0] || null);
    });
  } catch {
    callback(null);
  }
}

/**
 * Resolve the tab the user is browsing (not the extension popup).
 * Never trust tabs.query from the popup alone — use this from the service worker.
 * @param {number|undefined} preferredTabId optional tab id from a prior background resolution
 * @returns {Promise<{ url: string|null, tabId: number|undefined }>}
 */
function getCurrentTabDescriptor(preferredTabId) {
  return new Promise((resolve) => {
    const finish = (url, tabId) => {
      resolve({ url: url || null, tabId: tabId !== undefined && tabId !== null ? tabId : undefined });
    };

    const useTabOrFallback = (t) => {
      if (t && t.url) {
        finish(t.url, t.id);
        return;
      }
      if (isFirefoxMv2BackgroundRuntime()) {
        pickActiveTabAcrossWindowsFirefox((ft) => {
          if (ft && ft.url) {
            finish(ft.url, ft.id);
            return;
          }
          if (t && t.id != null) {
            finish(t.url || null, t.id);
            return;
          }
          finish(null, undefined);
        });
        return;
      }
      if (t && t.id != null) {
        finish(t.url || null, t.id);
        return;
      }
      finish(null, undefined);
    };

    if (preferredTabId != null) {
      chrome.tabs.get(preferredTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          tabsQuery(activeTabQueryOpts(), (tabs) => {
            useTabOrFallback(tabs && tabs[0]);
          });
          return;
        }
        finish(tab.url, tab.id);
      });
      return;
    }

    tabsQuery(activeTabQueryOpts(), (tabs) => {
      useTabOrFallback(tabs && tabs[0]);
    });
  });
}

function getCurrentTabUrl(preferredTabId) {
  return getCurrentTabDescriptor(preferredTabId).then((d) => d.url);
}

/**
 * True for http(s) or file pages where a content script can run.
 * Built-in / extension / devtools pages are not font-scannable here.
 */
function isScannablePage(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase();
  if (u.startsWith('http://') || u.startsWith('https://')) return true;
  return false;
}

function getRestrictedPageReason(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  try {
    const parsed = new URL(url);
    const host = (parsed.hostname || '').toLowerCase();
    if (FIREFOX_RESTRICTED_HOSTS.has(host)) {
      return `Firefox blocks extensions from injecting scripts on ${host}. Open a different site to scan fonts there.`;
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * Open a URL in the active tab (e.g. from about:blank) or a new tab.
 * Call only from a user gesture (popup button).
 */
function openUrlForScanning(rawUrl) {
  return new Promise((resolve) => {
    let formatted = (rawUrl || '').trim();
    if (!formatted) {
      resolve({ success: false, error: 'No URL provided' });
      return;
    }
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = 'https://' + formatted;
    }
    try {
      const parsed = new URL(formatted);
      if (!parsed.hostname) {
        resolve({ success: false, error: 'Invalid URL' });
        return;
      }
    } catch (e) {
      resolve({ success: false, error: 'Invalid URL' });
      return;
    }

    tabsQuery(activeTabQueryOpts(), (tabs) => {
      const tab = tabs[0];
      const current = tab && tab.url ? tab.url : '';
      const useSameTab = tab && tab.id != null && !isScannablePage(current);

      if (useSameTab) {
        chrome.tabs.update(tab.id, { url: formatted }, (updated) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve({ success: true, tabId: updated.id, mode: 'updated' });
        });
      } else {
        chrome.tabs.create({ url: formatted, active: true }, (created) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve({ success: true, tabId: created.id, mode: 'created' });
        });
      }
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const REMOTE_STYLESHEET_MAX = 20;
const REMOTE_STYLESHEET_TIMEOUT_MS = 6500;
const REMOTE_STYLESHEET_MAX_BYTES = 1_800_000;
const REMOTE_FETCH_CONCURRENCY = 6;

function isHttpOrHttpsUrl(href) {
  if (!href || typeof href !== 'string') {
    return false;
  }
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fetch third-party stylesheets from the extension context (not subject to page CORS),
 * parse @font-face rules, and return them for the content script to merge.
 * @param {string[]} hrefs
 * @returns {Promise<{ rules: object[], errors: object[] }>}
 */
async function fetchOneRemoteStylesheet(href) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_STYLESHEET_TIMEOUT_MS);
  try {
    const res = await fetch(href, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'force-cache'
    });

    if (!res.ok) {
      return { href, err: `HTTP ${res.status}`, rules: [] };
    }

    const text = await res.text();
    if (text.length > REMOTE_STYLESHEET_MAX_BYTES) {
      return { href, err: 'response too large', rules: [] };
    }

    const parsed = parseFontFacesFromCss(text, href);
    return { href, rules: parsed };
  } catch (e) {
    return { href, err: e && e.message ? e.message : String(e), rules: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRemoteStylesheetFontFaces(hrefs) {
  const rules = [];
  const errors = [];
  const list = Array.from(new Set((hrefs || []).filter(isHttpOrHttpsUrl))).slice(0, REMOTE_STYLESHEET_MAX);

  for (let i = 0; i < list.length; i += REMOTE_FETCH_CONCURRENCY) {
    const chunk = list.slice(i, i + REMOTE_FETCH_CONCURRENCY);
    const settled = await Promise.all(chunk.map((href) => fetchOneRemoteStylesheet(href)));
    for (const row of settled) {
      if (row.err) {
        errors.push({ href: row.href, err: row.err });
      }
      for (const r of row.rules || []) {
        rules.push(r);
      }
    }
  }

  return { rules, errors };
}

/**
 * Firefox MV2 / older hosts: no chrome.scripting — use tabs.executeScript.
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function ensureContentScriptsInjectedMV2(tabId) {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.executeScript) {
    return false;
  }

  const execFile = (file) =>
    new Promise((resolve, reject) => {
      chrome.tabs.executeScript(tabId, { file }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

  const hasEngine = await new Promise((resolve) => {
    chrome.tabs.executeScript(
      tabId,
      { code: 'typeof globalThis.detectFontsWithProgress==="function"' },
      (r) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(!!(r && r[0]));
      }
    );
  });

  try {
    if (!hasEngine) {
      try {
        await execFile('lib/font-detection.js');
      } catch (e) {
        const msg = e && e.message ? String(e.message) : '';
        if (!/already been declared|Identifier .* has already been declared|redeclaration/i.test(msg)) {
          throw e;
        }
      }
    }
    await execFile('content.js');
    return true;
  } catch (e) {
    console.warn('FontSource: MV2 executeScript inject failed', e);
    return false;
  }
}

/**
 * Chrome MV3: programmatic inject via chrome.scripting.
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function ensureContentScriptsInjectedMV3(tabId) {
  const target = { tabId, allFrames: false };
  const contentOnly = ['content.js'];
  const both = ['lib/font-detection.js', 'content.js'];

  let files = both;
  try {
    const probe = await chrome.scripting.executeScript({
      target,
      func: () => typeof globalThis.detectFontsWithProgress === 'function'
    });
    if (probe && probe[0] && probe[0].result === true) {
      files = contentOnly;
    }
  } catch {
    files = both;
  }

  const attempts = [
    { files },
    { files, injectImmediately: true }
  ];
  let lastErr;
  for (const a of attempts) {
    try {
      await chrome.scripting.executeScript({
        target,
        files: a.files,
        ...(a.injectImmediately ? { injectImmediately: true } : {})
      });
      return true;
    } catch (e) {
      lastErr = e;
      const msg = e && e.message ? String(e.message) : '';
      if (a.files === both && /already been declared|Identifier .* has already been declared/i.test(msg)) {
        try {
          await chrome.scripting.executeScript({
            target,
            files: contentOnly,
            ...(a.injectImmediately ? { injectImmediately: true } : {})
          });
          return true;
        } catch (e2) {
          lastErr = e2;
        }
      }
    }
  }
  console.warn('FontSource: programmatic content-script inject failed', lastErr);
  return false;
}

/**
 * Inject content scripts manually when tabs.sendMessage finds no listener (SPA / bfcache / timing).
 * Must load lib/font-detection.js whenever the scan engine is missing — injecting content.js alone
 * leaves detectFontsWithProgress undefined (ReferenceError on scan).
 * When the manifest already ran font-detection.js, skip re-injecting it: duplicate top-level const
 * in that file throws. Probe the isolated world first.
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function ensureContentScriptsInjected(tabId) {
  if (typeof chrome !== 'undefined' && chrome.scripting && chrome.scripting.executeScript) {
    return ensureContentScriptsInjectedMV3(tabId);
  }
  /* Firefox MV2 has no chrome.scripting; MV2 executeScript path is unused on Chrome/Safari MV3. */
  return ensureContentScriptsInjectedMV2(tabId);
}

async function trySendMessageToTab(tabId, action, data) {
  return new Promise((resolve) => {
    const message = { action, ...data };
    const done = (r) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          err: chrome.runtime.lastError.message || '',
          body: null
        });
        return;
      }
      resolve({ ok: true, err: '', body: r });
    };
    /* Omit frameId: main frame is the default; some sites mis-handle frameId: 0 with OOPIF / embeds. */
    try {
      chrome.tabs.sendMessage(tabId, message, done);
    } catch (e) {
      resolve({ ok: false, err: e && e.message ? String(e.message) : 'sendMessage failed', body: null });
    }
  });
}

async function sendMessageWithBackoff(tabId, action, data, maxAttempts) {
  let lastErr = '';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { ok, err, body } = await trySendMessageToTab(tabId, action, data);
    if (ok) {
      return { ok: true, body, err: '' };
    }
    lastErr = err;
    const retryable = /Receiving end does not exist|Could not establish connection|message port closed/i.test(
      lastErr
    );
    if (!retryable || attempt === maxAttempts - 1) {
      break;
    }
    await delay(120 * (attempt + 1) * (attempt + 1));
  }
  return { ok: false, body: null, err: lastErr };
}

/**
 * Send a message to a tab’s content script, with retries and a programmatic inject fallback.
 * @param {number} [tabIdOpt] Tab from the popup (recommended); otherwise last-focused active tab.
 */
async function sendMessageToContent(action, data = {}, tabIdOpt) {
  let tabId = tabIdOpt;
  if (tabId == null) {
    const d = await getCurrentTabDescriptor();
    if (d.tabId == null) {
      return { connectError: 'No active tab' };
    }
    tabId = d.tabId;
  }

  let { ok, body, err } = await sendMessageWithBackoff(tabId, action, data, 9);

  if (!ok && /Receiving end does not exist|Could not establish connection/i.test(err)) {
    const injected = await ensureContentScriptsInjected(tabId);
    if (injected) {
      await delay(280);
      const second = await sendMessageWithBackoff(tabId, action, data, 8);
      ok = second.ok;
      body = second.body;
      err = second.err;
    }
  }

  if (ok) {
    return body;
  }

  return { connectError: err || 'No response from the page script' };
}

/**
 * Normalize a tab content-script reply for scan/getFonts (handles empty or malformed payloads).
 * @param {unknown} body
 * @returns {{ fonts: unknown[] } | null}
 */
function normalizeTabFontPayload(body) {
  if (body == null || typeof body !== 'object') {
    return null;
  }
  const o = /** @type {{ fonts?: unknown; connectError?: string; error?: string }} */ (body);
  if (o.connectError) {
    return null;
  }
  if (typeof o.error === 'string' && o.error.length > 0) {
    return null;
  }
  if (Array.isArray(o.fonts)) {
    return { fonts: o.fonts };
  }
  if (Array.isArray(body)) {
    return { fonts: body };
  }
  return null;
}

// Scan current page for fonts
async function scanCurrentPage(options = {}, tabIdOpt) {
  const { url: currentUrl, tabId: resolvedTabId } = await getCurrentTabDescriptor(tabIdOpt);

  if (!currentUrl) {
    return { error: 'No active tab found' };
  }

  if (!isScannablePage(currentUrl)) {
    return {
      error:
        'This tab has no normal webpage to scan (blank or built-in page). Enter a URL below to open a site, then open FontSource again after it loads.',
      blank: true
    };
  }

  const restrictedReason = getRestrictedPageReason(currentUrl);
  if (restrictedReason) {
    return { error: restrictedReason };
  }

  if (Object.keys(options).length > 0) {
    updateScanOptions(options);
  }

  const response = await sendMessageToContent('scanPage', { options: state.scanOptions }, resolvedTabId);

  if (response && response.connectError) {
    return {
      error: `Could not attach to this tab: ${response.connectError}. Try reloading the page, then open FontSource again.`
    };
  }

  if (response && response.error) {
    return {
      error: `Font scan failed on this page: ${response.error}`
    };
  }

  const normalized = normalizeTabFontPayload(response);
  if (normalized) {
    return { fonts: normalized.fonts, url: currentUrl };
  }

  const fallback = await sendMessageToContent('getFonts', {}, resolvedTabId);
  if (fallback && !fallback.connectError && !fallback.error) {
    const fbNorm = normalizeTabFontPayload(fallback);
    if (fbNorm) {
      return { fonts: fbNorm.fonts, url: currentUrl };
    }
  }

  return {
    error:
      'No font data was returned from this tab (the page script may have failed silently). Try reloading the tab.'
  };
}

/**
 * Used by tests/panel-baseline-runner.mjs (Playwright) only; not called from web pages.
 * @param {number} tabId
 * @param {object} [options]
 */
globalThis.__fontSourceRunScanForTesting = (tabId, options) => scanCurrentPage(options || {}, tabId);

// Initialize on extension load
loadState().then(() => {
  console.log('FontSource: Background script initialized');
  console.log('FontSource: Scan options loaded:', state.scanOptions);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fontScanProgress') {
    if (fontScanProgressPort) {
      try {
        fontScanProgressPort.postMessage(request.payload);
      } catch (e) {
        /* popup may have closed */
      }
    }
    return false;
  }

  switch (request.action) {
    case 'fetchRemoteFontFaces':
      fetchRemoteStylesheetFontFaces(request.hrefs).then((result) => {
        sendResponse(result);
      });
      return true;

    case 'getState':
      sendResponse({ state });
      /* Must return false when sendResponse runs synchronously; true would keep the channel open and hang the popup. */
      return false;

    case 'updateState':
      if (request.scanOptions) {
        state.scanOptions = { ...state.scanOptions, ...request.scanOptions };
      }
      if (typeof request.showPreview === 'boolean') {
        state.showPreview = request.showPreview;
      }
      if (typeof request.groupBySource === 'boolean') {
        state.groupBySource = request.groupBySource;
      }
      if (typeof request.findSearchUrlTemplate === 'string') {
        state.findSearchUrlTemplate = normalizeFindSearchTemplate(request.findSearchUrlTemplate);
      }
      saveState().then(() => {
        sendResponse({ success: true, state });
      });
      return true;

    case 'scanPage':
      scanCurrentPage(request.options, request.tabId).then((result) => {
        sendResponse(result);
      });
      return true;

    case 'getCurrentUrl':
      getCurrentTabUrl(request.tabId).then((url) => {
        sendResponse({ url });
      });
      return true;

    case 'getTabScanContext':
      getCurrentTabDescriptor(request.tabId).then(({ url: tabUrl, tabId }) => {
        sendResponse({
          url: tabUrl,
          scannable: isScannablePage(tabUrl),
          tabId: tabId !== undefined ? tabId : undefined
        });
      });
      return true;

    case 'openUrl':
      openUrlForScanning(request.url).then((result) => {
        sendResponse(result);
      });
      return true;

    default:
      return false;
  }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    console.log('FontSource: Tab updated:', tab.url);
  }
});
