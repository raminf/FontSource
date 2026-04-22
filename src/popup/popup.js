/**
 * Popup Script
 * Handles popup UI interactions and font display
 */

const urlInput = document.getElementById('urlInput');
const scanBtn = document.getElementById('scanBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsContainer = document.getElementById('resultsContainer');
const fontCount = document.getElementById('fontCount');
const loadingSection = document.getElementById('loadingSection');
const emptySection = document.getElementById('emptySection');
const emptySectionMessage = document.getElementById('emptySectionMessage');
const settingsBtn = document.getElementById('settingsBtn');
const contentRoot = document.getElementById('contentRoot');
const blankIntro = document.getElementById('blankIntro');
const activePageBar = document.getElementById('activePageBar');
const activePageUrl = document.getElementById('activePageUrl');
const urlSectionHint = document.getElementById('urlSectionHint');
const urlFeedback = document.getElementById('urlFeedback');
const scanProgressFill = document.getElementById('scanProgressFill');
const scanProgressLabel = document.getElementById('scanProgressLabel');
const scanProgressMeta = document.getElementById('scanProgressMeta');
const pageScanBtn = document.getElementById('pageScanBtn');
const SCAN_REQUEST_TIMEOUT_MS = 30000;

/**
 * Firefox exposes `browser.*` with Promises; Chrome uses `chrome.*` with callbacks.
 * Prefer `browser` when present so messaging works reliably in Firefox popups.
 * @returns {{ runtime: object, tabs: object | undefined } | { runtime: null, tabs: null }}
 */
function extensionApi() {
  if (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.sendMessage === 'function') {
    return { runtime: browser.runtime, tabs: browser.tabs };
  }
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return { runtime: chrome.runtime, tabs: chrome.tabs };
  }
  return { runtime: null, tabs: null };
}

(function setPopupVersionFromManifest() {
  try {
    const el = document.getElementById('popupAppVersion');
    const api = extensionApi();
    if (el && api.runtime && typeof api.runtime.getManifest === 'function') {
      el.textContent = `v${api.runtime.getManifest().version}`;
    }
  } catch (e) {
    console.error('FontSource popup: setPopupVersionFromManifest failed', e);
  }
})();

/** @type {chrome.runtime.Port | null} */
let fontScanProgressPort = null;

let currentFonts = [];
let currentUrl = '';
/** Tab behind the popup; set when a normal page is active (manual scan). */
let activeTargetTabId;
let scanOptions = { scanRoot: false };
/** URL template with `{query}` for the Find button (from settings). */
let findSearchUrlTemplate = 'https://www.google.com/search?q={query}';
/** From settings: show sample text using detected families (and remote @font-face when URLs exist). */
let showPreview = true;
/** @type {'page' | 'blank'} */
let uiMode = 'blank';

function connectFontScanProgressPort() {
  disconnectFontScanProgressPort();
  try {
    const api = extensionApi();
    if (api.runtime && typeof api.runtime.connect === 'function') {
      fontScanProgressPort = api.runtime.connect({ name: 'fontScanProgress' });
    }
  } catch (e) {
    fontScanProgressPort = null;
  }
}

function disconnectFontScanProgressPort() {
  if (fontScanProgressPort) {
    try {
      fontScanProgressPort.disconnect();
    } catch (e) {
      /* ignore */
    }
    fontScanProgressPort = null;
  }
}

function resetScanProgressUI() {
  if (scanProgressFill) {
    scanProgressFill.style.width = '0%';
  }
  if (scanProgressLabel) {
    scanProgressLabel.textContent = 'Preparing scan…';
  }
  if (scanProgressMeta) {
    scanProgressMeta.textContent = '';
    scanProgressMeta.hidden = true;
  }
}

function applyScanProgressPayload(payload) {
  if (!payload) return;
  const pct =
    typeof payload.percent === 'number'
      ? Math.max(0, Math.min(100, Math.round(payload.percent)))
      : 0;
  if (scanProgressFill) {
    scanProgressFill.style.width = `${pct}%`;
  }
  if (scanProgressLabel) {
    scanProgressLabel.textContent = payload.detail || payload.phase || '…';
  }
  let meta = '';
  if (payload.phase === 'elements' && typeof payload.total === 'number') {
    const cur = typeof payload.current === 'number' ? payload.current : 0;
    meta = `${cur.toLocaleString()} / ${payload.total.toLocaleString()} elements`;
    if (typeof payload.uniqueFamilies === 'number') {
      meta += ` · ${payload.uniqueFamilies.toLocaleString()} families`;
    }
  } else if (payload.phase === 'analyze' && typeof payload.uniqueFamilies === 'number') {
    meta = `${payload.uniqueFamilies.toLocaleString()} families`;
  } else if (payload.phase === 'stylesheet' && typeof payload.uniqueFamilies === 'number') {
    meta = `${payload.uniqueFamilies.toLocaleString()} families from @font-face`;
  }
  if (scanProgressMeta) {
    scanProgressMeta.textContent = meta;
    scanProgressMeta.hidden = !meta;
  }
}

function sendMessage(payload) {
  const api = extensionApi();
  if (!api.runtime || typeof api.runtime.sendMessage !== 'function') {
    return Promise.resolve(null);
  }
  if (typeof browser !== 'undefined' && api.runtime === browser.runtime) {
    return api.runtime.sendMessage(payload).catch((e) => {
      const msg = e && e.message ? e.message : String(e);
      console.warn('FontSource popup message error:', msg);
      return null;
    });
  }
  return new Promise((resolve) => {
    api.runtime.sendMessage(payload, (response) => {
      if (api.runtime.lastError) {
        console.warn('FontSource popup message error:', api.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

function sendMessageWithTimeout(payload, timeoutMs) {
  return Promise.race([
    sendMessage(payload),
    new Promise((resolve) => {
      window.setTimeout(() => {
        resolve({
          error:
            'Scan timed out. This page may block extension scripts, still be loading, or be too heavy to scan right now.'
        });
      }, timeoutMs);
    })
  ]);
}

function isScannableWebUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  const u = url.toLowerCase();
  return u.startsWith('http://') || u.startsWith('https://');
}

function queryTabsFromPopup(query) {
  if (typeof browser !== 'undefined' && browser.tabs && typeof browser.tabs.query === 'function') {
    return browser.tabs.query(query).catch(() => []);
  }

  const api = extensionApi();
  if (!api.tabs || typeof api.tabs.query !== 'function') {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    api.tabs.query(query, (tabs) => {
      const err =
        typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError
          ? chrome.runtime.lastError
          : null;
      if (err) {
        resolve([]);
        return;
      }
      resolve(tabs || []);
    });
  });
}

/** Firefox MV2 build only; Chrome and Safari ship MV3 (manifest_version 3). */
function isFirefoxMv2ExtensionPopup() {
  try {
    const mv =
      typeof browser !== 'undefined' && browser.runtime && browser.runtime.getManifest
        ? browser.runtime.getManifest().manifest_version
        : undefined;
    return mv === 2;
  } catch {
    return false;
  }
}

/**
 * Firefox MV2: background tabs.query can miss the page while the toolbar popup has focus;
 * the popup can still query the active tab. Unused on Chrome/Safari MV3.
 * @returns {Promise<{ url: string, tabId: number, scannable: true } | null>}
 */
async function resolveTabContextFromPopupWindow() {
  const api =
    typeof browser !== 'undefined' && browser.tabs
      ? browser
      : typeof chrome !== 'undefined' && chrome.tabs
        ? chrome
        : null;
  if (!api || !api.tabs || !api.tabs.query) {
    return null;
  }

  let tabs = await queryTabsFromPopup({ active: true, lastFocusedWindow: true });
  let pick = tabs.find((t) => t && t.id != null && t.url && isScannableWebUrl(t.url));
  if (!pick) {
    tabs = await queryTabsFromPopup({ active: true });
    pick = tabs.find((t) => t && t.id != null && t.url && isScannableWebUrl(t.url));
  }
  if (!pick) {
    return null;
  }
  return { url: pick.url, tabId: pick.id, scannable: true };
}

/**
 * Merge background getTabScanContext with a popup-side fallback for reliable tabId + URL.
 * @returns {Promise<{ url: string, tabId?: number, scannable: boolean }>}
 */
async function getTabScanContextMerged() {
  const raw = (await sendMessage({ action: 'getTabScanContext' })) || {};
  const url = typeof raw.url === 'string' ? raw.url : '';
  const tabId = typeof raw.tabId === 'number' && Number.isFinite(raw.tabId) ? raw.tabId : undefined;
  const okFromBg = !!(raw.scannable && url && isScannableWebUrl(url) && tabId != null);

  if (okFromBg) {
    return { url, tabId, scannable: true };
  }

  let fromPopup = null;
  if (isFirefoxMv2ExtensionPopup()) {
    fromPopup = await resolveTabContextFromPopupWindow();
  }
  if (fromPopup) {
    return fromPopup;
  }

  return {
    url: url || '',
    tabId,
    scannable: !!(raw.scannable && url && isScannableWebUrl(url) && tabId != null)
  };
}

function showPageReadyUi(tabUrl) {
  loadingSection.style.display = 'none';
  resultsSection.style.display = 'none';
  emptySection.hidden = true;
  activePageUrl.textContent = truncateUrl(tabUrl, 48);
  activePageBar.hidden = false;
  if (pageScanBtn) {
    pageScanBtn.disabled = false;
  }
}

async function init() {
  await loadState();
  setupEventListeners();

  const ctx = await getTabScanContextMerged();
  const tabUrl = ctx && ctx.url ? ctx.url : '';
  const scannable = !!(ctx && ctx.scannable);

  currentUrl = tabUrl;
  activeTargetTabId = typeof ctx?.tabId === 'number' ? ctx.tabId : undefined;

  if (scannable) {
    uiMode = 'page';
    applyLayoutMode();
    blankIntro.hidden = true;
    urlSectionHint.textContent = 'Or open another address below.';
    showPageReadyUi(tabUrl);
    if (pageScanBtn && typeof activeTargetTabId !== 'number') {
      pageScanBtn.disabled = true;
      urlSectionHint.textContent =
        'Could not resolve the page tab from the extension. Close the popup, focus the site tab, and open FontSource again.';
    }
  } else {
    uiMode = 'blank';
    applyLayoutMode();
    activePageBar.hidden = true;
    blankIntro.hidden = false;
    urlSectionHint.textContent = 'Open a site with the field below, then use Scan this page.';
    resultsSection.style.display = 'none';
    loadingSection.style.display = 'none';
    emptySection.hidden = true;
    urlInput.focus();
  }
}

function applyLayoutMode() {
  contentRoot.dataset.mode = uiMode;
}

async function loadState() {
  const response = await sendMessage({ action: 'getState' });
  if (response && response.state) {
    scanOptions = response.state.scanOptions || { scanRoot: false };
    showPreview = response.state.showPreview !== false;
    const t = response.state.findSearchUrlTemplate;
    if (typeof t === 'string' && t.includes('{query}')) {
      findSearchUrlTemplate = t;
    }
  }
}

function setupEventListeners() {
  scanBtn.addEventListener('click', () => openSubmittedUrl());
  if (pageScanBtn) {
    pageScanBtn.addEventListener('click', async () => {
      const ctx = await getTabScanContextMerged();
      if (!ctx || !ctx.scannable) {
        showEmptyState('No scannable page found. Click the website tab, then open FontSource again.');
        return;
      }
      if (typeof ctx.tabId !== 'number') {
        showEmptyState('Could not determine which tab to scan. Try reloading the page.');
        return;
      }
      activeTargetTabId = ctx.tabId;
      currentUrl = ctx.url || currentUrl;
      activePageUrl.textContent = truncateUrl(currentUrl, 48);
      await scanCurrentPage(activeTargetTabId);
    });
  }
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openSubmittedUrl();
    }
  });
  settingsBtn.addEventListener('click', openSettings);

  resultsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.find-font-btn');
    if (!btn) {
      return;
    }
    const idx = parseInt(btn.getAttribute('data-find-index'), 10);
    if (Number.isNaN(idx) || !currentFonts[idx]) {
      return;
    }
    const font = currentFonts[idx];
    const srcList = font.sourceInfo || [];
    const first = srcList[0] || {};
    void openFontFindTab(buildFontFindQuery(font, first));
  });
}

function setUrlFeedback(message, isError) {
  if (!urlFeedback) return;
  urlFeedback.textContent = message;
  urlFeedback.hidden = !message;
  urlFeedback.classList.toggle('url-feedback--error', !!isError);
  if (message && !isError) {
    window.clearTimeout(setUrlFeedback._t);
    setUrlFeedback._t = window.setTimeout(() => {
      urlFeedback.hidden = true;
      urlFeedback.textContent = '';
    }, 6000);
  }
}

async function openSubmittedUrl() {
  const raw = urlInput.value.trim();
  if (!raw) {
    setUrlFeedback('Enter full URL.', true);
    return;
  }

  setUrlFeedback('');

  const response = await sendMessage({ action: 'openUrl', url: raw });

  if (response && response.success) {
    setUrlFeedback(
      'Opening… If this popup closed, click FontSource in the toolbar again after the page finishes loading.',
      false
    );
  } else {
    setUrlFeedback((response && response.error) || 'Could not open that address.', true);
  }
}

async function scanCurrentPage(explicitTabId) {
  if (pageScanBtn) {
    pageScanBtn.disabled = true;
  }
  showLoading();
  connectFontScanProgressPort();
  if (fontScanProgressPort) {
    fontScanProgressPort.onMessage.addListener(applyScanProgressPayload);
  }

  const tabId = explicitTabId != null ? explicitTabId : activeTargetTabId;

  try {
    const response = await sendMessageWithTimeout(
      {
        action: 'scanPage',
        options: scanOptions,
        tabId
      },
      SCAN_REQUEST_TIMEOUT_MS
    );
    if (response && Array.isArray(response.fonts)) {
      currentFonts = response.fonts;
      currentUrl = response.url || currentUrl;
      activePageUrl.textContent = truncateUrl(currentUrl, 48);
      activePageBar.hidden = false;
      if (scanProgressFill) {
        scanProgressFill.style.width = '100%';
      }
      if (scanProgressLabel) {
        scanProgressLabel.textContent = 'Rendering results…';
      }
      await displayFonts(currentFonts);
    } else if (response && response.error) {
      if (response.blank) {
        uiMode = 'blank';
        applyLayoutMode();
        blankIntro.hidden = false;
        activePageBar.hidden = true;
        urlSectionHint.textContent =
          'Enter a website address to open it. When the page has loaded, open FontSource and tap "Scan this page".';
      }
      showEmptyState(response.error);
    } else {
      showEmptyState('Failed to scan this page.');
    }
  } catch (e) {
    console.error('Scan error:', e);
    showEmptyState('Failed to scan page. Try reloading the tab.');
  } finally {
    if (fontScanProgressPort) {
      fontScanProgressPort.onMessage.removeListener(applyScanProgressPayload);
    }
    disconnectFontScanProgressPort();
    if (pageScanBtn) {
      pageScanBtn.disabled = false;
    }
  }
}

function removePreviewFontStyles() {
  const el = document.getElementById('fontSourcePreviewFaces');
  if (el) {
    el.remove();
  }
}

function normalizePreviewFontWeight(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s || s === 'normal') {
    return '400';
  }
  if (s === 'bold' || s === 'bolder') {
    return '700';
  }
  if (s === 'lighter') {
    return '300';
  }
  if (/^\d{2,3}$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 900) {
      return String(n);
    }
  }
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n >= 1 && n <= 900) {
    return String(n);
  }
  return '400';
}

function normalizePreviewFontStyle(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'italic' || s === 'oblique' ? s : 'normal';
}

function safeCssFontSize(v) {
  const t = String(v || '').trim();
  return /^[\d.]+(px|pt|rem|em|%)$/i.test(t) ? t : '18px';
}

function formatHintForFontUrl(abs) {
  const path = abs.split('?')[0].split('#')[0].toLowerCase();
  if (path.endsWith('.woff2')) {
    return ' format(\'woff2\')';
  }
  if (path.endsWith('.woff')) {
    return ' format(\'woff\')';
  }
  if (path.endsWith('.ttf')) {
    return ' format(\'truetype\')';
  }
  if (path.endsWith('.otf')) {
    return ' format(\'opentype\')';
  }
  return '';
}

/**
 * All file URLs inside a CSS src descriptor (may list multiple url()s / formats).
 * @param {string} src
 * @returns {string[]}
 */
function extractAllFontFileUrls(src) {
  if (!src || typeof src !== 'string') {
    return [];
  }
  const out = [];
  const re = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const u = m[1].trim();
    if (u.toLowerCase().startsWith('data:')) {
      continue;
    }
    if (u.endsWith('…') || u.endsWith('...')) {
      continue;
    }
    out.push(u);
  }
  return out;
}

/**
 * Build @font-face rules for popup preview: one synthetic family per card, multiple
 * weight/style variants so the preview can match how the page used the font.
 * @param {object[]} fonts
 * @returns {{ css: string, previewHintsByIndex: { family: string|null, fontWeight: string, fontStyle: string, fontSize: string }[] }}
 */
function buildPreviewFontFaceCss(fonts) {
  const previewHintsByIndex = [];
  const chunks = [];
  if (!Array.isArray(fonts)) {
    return { css: '', previewHintsByIndex };
  }
  const maxFacesPerFont = 8;

  fonts.forEach((font, idx) => {
    const sample = font.usedInElements && font.usedInElements[0];
    const wantW = normalizePreviewFontWeight(sample && sample.fontWeight);
    const wantS = normalizePreviewFontStyle(sample && sample.fontStyle);
    const fontSize = safeCssFontSize(sample && sample.fontSize);

    const fam = `__FontSourcePreview_${idx}`;
    let anyFace = false;
    let emitted = 0;
    const rules = font.fontFaceRules || [];

    for (let i = 0; i < rules.length && emitted < maxFacesPerFont; i++) {
      const urls = extractAllFontFileUrls(rules[i].src);
      const rw = normalizePreviewFontWeight(rules[i].fontWeight);
      const rs = normalizePreviewFontStyle(rules[i].fontStyle);
      const ur = rules[i].unicodeRange ? String(rules[i].unicodeRange).trim().slice(0, 160) : '';

      for (let j = 0; j < urls.length; j++) {
        const abs = resolveFontSourceLink(urls[j], currentUrl);
        if (!abs) {
          continue;
        }
        const fmt = formatHintForFontUrl(abs);
        const uni = ur ? `unicode-range:${ur};` : '';
        chunks.push(
          `@font-face{font-family:${JSON.stringify(fam)};src:url(${JSON.stringify(abs)})${fmt};font-weight:${rw};font-style:${rs};font-display:swap;${uni}}`
        );
        anyFace = true;
        emitted++;
        break;
      }
    }

    if (emitted < maxFacesPerFont) {
      const infos = font.sourceInfo || [];
      for (let j = 0; j < infos.length && emitted < maxFacesPerFont; j++) {
        const url = infos[j].url;
        if (!url || typeof url !== 'string') {
          continue;
        }
        const pathOnly = url.split('?')[0].split('#')[0];
        if (!/\.(woff2?|ttf|otf)$/i.test(pathOnly)) {
          continue;
        }
        const abs = resolveFontSourceLink(url, currentUrl);
        if (!abs) {
          continue;
        }
        const fmt = formatHintForFontUrl(abs);
        chunks.push(
          `@font-face{font-family:${JSON.stringify(fam)};src:url(${JSON.stringify(abs)})${fmt};font-weight:${wantW};font-style:${wantS};font-display:swap;}`
        );
        anyFace = true;
        emitted++;
        break;
      }
    }

    previewHintsByIndex[idx] = {
      family: anyFace ? fam : null,
      fontWeight: wantW,
      fontStyle: wantS,
      fontSize
    };
  });

  return { css: chunks.join('\n'), previewHintsByIndex };
}

/**
 * Serialize font-family stack for use in a style attribute (quoted named families).
 * @param {string} name
 * @returns {string}
 */
function familiesForPreviewCss(name) {
  const s = String(name || '').trim();
  if (!s) {
    return 'ui-sans-serif, sans-serif';
  }
  const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|emoji|math)$/i;
  return s
    .split(',')
    .map((part) => {
      const p = part.trim().replace(/^["']|["']$/g, '');
      if (!p) {
        return null;
      }
      if (generic.test(p)) {
        return p;
      }
      return `'${p.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;
    })
    .filter(Boolean)
    .join(', ');
}

async function displayFonts(fonts) {
  if (!fonts || fonts.length === 0) {
    showEmptyState('No fonts were detected on this page.');
    return;
  }

  await loadState();

  fontCount.textContent = `${fonts.length} font${fonts.length !== 1 ? 's' : ''}`;

  removePreviewFontStyles();
  let previewHintsByIndex = [];
  if (showPreview) {
    const built = buildPreviewFontFaceCss(fonts);
    previewHintsByIndex = built.previewHintsByIndex;
    if (built.css) {
      const style = document.createElement('style');
      style.id = 'fontSourcePreviewFaces';
      style.textContent = built.css;
      document.head.appendChild(style);
    }
  }

  const cards = fonts.map((font, idx) => createFontCardElement(font, idx, previewHintsByIndex[idx]));
  resultsContainer.replaceChildren(...cards);

  resultsSection.style.display = 'block';
  emptySection.hidden = true;
  loadingSection.style.display = 'none';
}

function humanizeFamilyName(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function basenameFromSourceUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  const path = url.split('?')[0].split('#')[0];
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function buildFontFindQuery(font, source) {
  const name = humanizeFamilyName(font.fontFamily);
  const parts = [name, 'web', 'font', 'license'];
  const bn = basenameFromSourceUrl(source.url || '');
  if (bn && bn.includes('.')) {
    parts.push(bn);
  }
  return parts.join(' ');
}

async function openFontFindTab(query) {
  await loadState();
  const enc = encodeURIComponent(query);
  const tpl =
    findSearchUrlTemplate && findSearchUrlTemplate.includes('{query}')
      ? findSearchUrlTemplate
      : 'https://www.google.com/search?q={query}';
  const url = tpl.split('{query}').join(enc);
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return;
    }
    const tabsApi = extensionApi().tabs;
    if (tabsApi && typeof tabsApi.create === 'function') {
      tabsApi.create({ url: u.href, active: true });
    }
  } catch (e) {
    console.warn('FontSource: invalid find URL', e);
  }
}

function createFontCard(font, cardIndex, previewHint) {
  const sources = font.sourceInfo || [];
  const source = sources[0] || { service: 'Custom / Self-hosted', license: 'Varies by font' };

  let sourceType = 'custom';
  if (source.service.toLowerCase().includes('google')) {
    sourceType = 'google-fonts';
  } else if (source.service.toLowerCase().includes('adobe')) {
    sourceType = 'adobe-typekit';
  } else if (source.service.toLowerCase().includes('fonts.com')) {
    sourceType = 'fonts-com';
  }

  const sampleEls = font.usedInElements || [];
  const usageTotal =
    typeof font.usageElementCount === 'number' ? font.usageElementCount : sampleEls.length;
  const usageTruncated = usageTotal > sampleEls.length;
  const usageCount = usageTotal;
  const usageExamples = sampleEls
    .slice(0, 5)
    .map((el) => escapeHtml(el.selector))
    .join(', ');
  const usageNote = usageTruncated
    ? ` · ${sampleEls.length} sample selector${sampleEls.length !== 1 ? 's' : ''}`
    : '';

  const licenseLink = source.licenseUrl
    ? `<a href="${source.licenseUrl}" target="_blank" rel="noopener noreferrer" class="license-link">View License</a>`
    : '';

  let previewSection = '';
  if (showPreview && previewHint) {
    const stack = previewHint.family
      ? `'${previewHint.family}', ${familiesForPreviewCss(font.fontFamily)}`
      : familiesForPreviewCss(font.fontFamily);
    const styleAttr = `font-family:${stack};font-weight:${previewHint.fontWeight};font-style:${previewHint.fontStyle};font-size:${previewHint.fontSize};`;
    previewSection = `<div class="font-card-preview" style="${escapeHtmlAttr(styleAttr)}">
        <span class="font-card-preview-label">Preview</span>
        <p class="font-card-preview-sample">The quick brown fox jumps over the lazy dog.</p>
        <p class="font-card-preview-meta">${escapeHtml(font.fontFamily)}</p>
      </div>`;
  }

  return `
    <div class="font-card">
      <div class="font-card-header">
        <div class="font-name">${escapeHtml(font.fontFamily)}</div>
        <span class="font-source ${sourceType}">${escapeHtml(source.service)}</span>
      </div>
      ${previewSection || ''}

      <div class="font-details">
        <div class="detail-item">
          <span class="detail-label">Size</span>
          <span class="detail-value">${font.usedInElements && font.usedInElements[0] ? font.usedInElements[0].fontSize : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Weight</span>
          <span class="detail-value">${font.usedInElements && font.usedInElements[0] ? font.usedInElements[0].fontWeight : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Style</span>
          <span class="detail-value">${font.usedInElements && font.usedInElements[0] ? font.usedInElements[0].fontStyle : 'N/A'}</span>
        </div>
        <div class="detail-item detail-item--full">
          <div class="detail-source-header">
            <span class="detail-label">Source</span>
            <button type="button" class="find-font-btn" data-find-index="${cardIndex}" title="Search the web for this font (uses your Settings search URL)">Find</button>
          </div>
          <div class="detail-source-body">
            ${renderFontSourceUrl(source.url)}
          </div>
        </div>
      </div>

      <div class="font-usage">
        <span class="usage-label">Used in (${usageCount} elements${usageNote})</span>
        <div class="usage-list">
          ${usageExamples ? usageExamples.split(', ').map((el) => `<span class="usage-item">${el}</span>`).join('') : '<span class="usage-item">N/A</span>'}
        </div>
      </div>

      <div class="font-license">
        <span class="license-label">License</span>
        <div class="license-text">${escapeHtml(source.license)} ${licenseLink ? `| ${licenseLink}` : ''}</div>
      </div>
    </div>
  `;
}

function textEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  el.textContent = text;
  return el;
}

function createFontSourceNode(rawUrl) {
  if (!rawUrl) {
    return textEl('span', 'detail-value', 'No file URL');
  }
  const href = resolveFontSourceLink(rawUrl, currentUrl);
  if (!href) {
    return textEl('span', 'detail-value detail-value--plain', rawUrl);
  }
  const link = document.createElement('a');
  link.className = 'detail-value detail-value--link';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = rawUrl;
  return link;
}

function createFontCardElement(font, cardIndex, previewHint) {
  const sources = font.sourceInfo || [];
  const source = sources[0] || { service: 'Custom / Self-hosted', license: 'Varies by font' };
  const firstUse = font.usedInElements && font.usedInElements[0] ? font.usedInElements[0] : null;

  let sourceType = 'custom';
  if (source.service.toLowerCase().includes('google')) {
    sourceType = 'google-fonts';
  } else if (source.service.toLowerCase().includes('adobe')) {
    sourceType = 'adobe-typekit';
  } else if (source.service.toLowerCase().includes('fonts.com')) {
    sourceType = 'fonts-com';
  }

  const sampleEls = font.usedInElements || [];
  const usageTotal =
    typeof font.usageElementCount === 'number' ? font.usageElementCount : sampleEls.length;
  const usageTruncated = usageTotal > sampleEls.length;
  const usageNote = usageTruncated
    ? ` · ${sampleEls.length} sample selector${sampleEls.length !== 1 ? 's' : ''}`
    : '';

  const card = document.createElement('div');
  card.className = 'font-card';

  const header = document.createElement('div');
  header.className = 'font-card-header';
  header.appendChild(textEl('div', 'font-name', String(font.fontFamily || '')));
  header.appendChild(textEl('span', `font-source ${sourceType}`, String(source.service || 'Unknown')));
  card.appendChild(header);

  if (showPreview && previewHint) {
    const preview = document.createElement('div');
    preview.className = 'font-card-preview';
    const stack = previewHint.family
      ? `'${previewHint.family}', ${familiesForPreviewCss(font.fontFamily)}`
      : familiesForPreviewCss(font.fontFamily);
    preview.style.fontFamily = stack;
    preview.style.fontWeight = previewHint.fontWeight;
    preview.style.fontStyle = previewHint.fontStyle;
    preview.style.fontSize = previewHint.fontSize;
    preview.appendChild(textEl('span', 'font-card-preview-label', 'Preview'));
    preview.appendChild(textEl('p', 'font-card-preview-sample', 'The quick brown fox jumps over the lazy dog.'));
    preview.appendChild(textEl('p', 'font-card-preview-meta', String(font.fontFamily || '')));
    card.appendChild(preview);
  }

  const details = document.createElement('div');
  details.className = 'font-details';

  const makeDetail = (label, value) => {
    const item = document.createElement('div');
    item.className = 'detail-item';
    item.appendChild(textEl('span', 'detail-label', label));
    item.appendChild(textEl('span', 'detail-value', value));
    return item;
  };

  details.appendChild(makeDetail('Size', firstUse ? firstUse.fontSize : 'N/A'));
  details.appendChild(makeDetail('Weight', firstUse ? firstUse.fontWeight : 'N/A'));
  details.appendChild(makeDetail('Style', firstUse ? firstUse.fontStyle : 'N/A'));

  const sourceItem = document.createElement('div');
  sourceItem.className = 'detail-item detail-item--full';
  const sourceHeader = document.createElement('div');
  sourceHeader.className = 'detail-source-header';
  sourceHeader.appendChild(textEl('span', 'detail-label', 'Source'));
  const findBtn = document.createElement('button');
  findBtn.type = 'button';
  findBtn.className = 'find-font-btn';
  findBtn.setAttribute('data-find-index', String(cardIndex));
  findBtn.title = 'Search the web for this font (uses your Settings search URL)';
  findBtn.textContent = 'Find';
  sourceHeader.appendChild(findBtn);
  sourceItem.appendChild(sourceHeader);
  const sourceBody = document.createElement('div');
  sourceBody.className = 'detail-source-body';
  sourceBody.appendChild(createFontSourceNode(source.url));
  sourceItem.appendChild(sourceBody);
  details.appendChild(sourceItem);
  card.appendChild(details);

  const usage = document.createElement('div');
  usage.className = 'font-usage';
  usage.appendChild(textEl('span', 'usage-label', `Used in (${usageTotal} elements${usageNote})`));
  const usageList = document.createElement('div');
  usageList.className = 'usage-list';
  const selectors = sampleEls.slice(0, 5).map((el) => String(el.selector || ''));
  const usageItems = selectors.length ? selectors : ['N/A'];
  for (const selector of usageItems) {
    usageList.appendChild(textEl('span', 'usage-item', selector));
  }
  usage.appendChild(usageList);
  card.appendChild(usage);

  const license = document.createElement('div');
  license.className = 'font-license';
  license.appendChild(textEl('span', 'license-label', 'License'));
  const licenseText = document.createElement('div');
  licenseText.className = 'license-text';
  licenseText.appendChild(document.createTextNode(String(source.license || 'Unknown license')));
  if (source.licenseUrl) {
    licenseText.appendChild(document.createTextNode(' | '));
    const licenseLink = document.createElement('a');
    licenseLink.className = 'license-link';
    licenseLink.href = source.licenseUrl;
    licenseLink.target = '_blank';
    licenseLink.rel = 'noopener noreferrer';
    licenseLink.textContent = 'View License';
    licenseText.appendChild(licenseLink);
  }
  license.appendChild(licenseText);
  card.appendChild(license);

  return card;
}

function showLoading() {
  removePreviewFontStyles();
  resultsSection.style.display = 'none';
  emptySection.hidden = true;
  loadingSection.style.display = 'flex';
  resetScanProgressUI();
}

function showEmptyState(message) {
  removePreviewFontStyles();
  resultsSection.style.display = 'none';
  loadingSection.style.display = 'none';
  emptySection.hidden = false;
  emptySectionMessage.textContent = message;
}

function openSettings() {
  const api = extensionApi().runtime;
  if (api && typeof api.openOptionsPage === 'function') {
    try {
      const maybe = api.openOptionsPage();
      if (maybe && typeof maybe.catch === 'function') {
        maybe.catch(() => {});
      }
      return;
    } catch (_e) {
      /* ignore */
    }
  }
  if (api && typeof api.getURL === 'function') {
    const tabsApi = extensionApi().tabs;
    if (tabsApi && typeof tabsApi.create === 'function') {
      tabsApi.create({ url: api.getURL('settings/settings.html'), active: true });
    }
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeHtmlAttr(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}

/**
 * Build an https? URL for opening in a new tab (resolves site-relative paths against the scanned page).
 * @param {string} rawUrl
 * @param {string} pageUrl
 * @returns {string|null}
 */
function resolveFontSourceLink(rawUrl, pageUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }
  const s = rawUrl.trim();
  if (!s) {
    return null;
  }
  try {
    let abs;
    if (/^https?:\/\//i.test(s)) {
      abs = new URL(s).href;
    } else if (/^\/\//.test(s)) {
      abs = new URL(`https:${s}`).href;
    } else {
      const base = pageUrl && /^https?:\/\//i.test(pageUrl) ? pageUrl : '';
      if (!base) {
        return null;
      }
      abs = new URL(s, base).href;
    }
    const u = new URL(abs);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return null;
    }
    return u.href;
  } catch {
    return null;
  }
}

function renderFontSourceUrl(rawUrl) {
  if (!rawUrl) {
    return '<span class="detail-value">No file URL</span>';
  }
  const href = resolveFontSourceLink(rawUrl, currentUrl);
  const label = escapeHtml(rawUrl);
  if (!href) {
    return `<span class="detail-value detail-value--plain">${label}</span>`;
  }
  return `<a class="detail-value detail-value--link" href="${escapeHtmlAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function truncateUrl(url, maxLength) {
  if (!url || url.length <= maxLength) return url || '';
  return url.substring(0, maxLength - 3) + '...';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  void init();
}
