/**
 * Font Detection Library
 * Provides utilities for detecting fonts and identifying their sources
 */

// Known font services and their identifiers
const FONT_SERVICES = {
  'google-fonts': {
    name: 'Google Fonts',
    domains: ['fonts.googleapis.com', 'fonts.gstatic.com'],
    license: 'Open Font License / Apache 2.0 / SIL OFL',
    licenseUrl: 'https://fonts.google.com/metadata/licenses'
  },
  'adobe-typekit': {
    name: 'Adobe Fonts',
    domains: [
      'use.typekit.net',
      'use.typekit.com',
      'p.typekit.net',
      'typekit.net',
      'fonts.adobe.com',
      'use.typekit.org'
    ],
    license: 'Adobe Fonts License',
    licenseUrl: 'https://fonts.adobe.com/licenses'
  },
  'fonts-com': {
    name: 'Fonts.com',
    domains: ['fast.fonts.net', 'fonts.com'],
    license: 'Fonts.com Webfont License',
    licenseUrl: 'https://www.fonts.com/legal/webfonts'
  },
  'fontdeck': {
    name: 'Fontdeck',
    domains: ['fontdeck.com', 'fonts.fontdeck.com'],
    license: 'Fontdeck Webfont License',
    licenseUrl: 'https://fontdeck.com/legal'
  },
  'typeface': {
    name: 'Typeface',
    domains: ['typeface.net'],
    license: 'Typeface License',
    licenseUrl: 'https://typeface.net/terms'
  },
  'monotype': {
    name: 'Monotype',
    domains: ['monotype.com', 'fonts.monotype.com'],
    license: 'Monotype Webfont License',
    licenseUrl: 'https://www.monotype.com/legal/webfonts'
  },
  'custom': {
    name: 'Custom / Self-hosted',
    domains: [],
    license: 'Varies by font',
    licenseUrl: null
  },
  system: {
    name: 'System / local',
    domains: [],
    license: 'Bundled with the OS or installed locally',
    licenseUrl: null
  }
};

/**
 * When a font file URL does not match a known vendor in FONT_SERVICES,
 * label common CDNs and hosts by hostname substring (first match wins).
 */
const GENERIC_CDN_HOST_HINTS = [
  { match: 'cdn.jsdelivr.net', name: 'jsDelivr', licenseUrl: 'https://www.jsdelivr.com/' },
  { match: 'cdnjs.cloudflare.com', name: 'cdnjs', licenseUrl: 'https://cdnjs.com/' },
  { match: 'unpkg.com', name: 'unpkg', licenseUrl: 'https://unpkg.com/' },
  { match: 'fonts.bunny.net', name: 'Bunny Fonts', licenseUrl: 'https://fonts.bunny.net/' },
  { match: 'esm.sh', name: 'esm.sh', licenseUrl: 'https://esm.sh/' },
  { match: 'skypack.dev', name: 'Skypack', licenseUrl: 'https://www.skypack.dev/' },
  { match: 'rsms.me', name: 'rsms.me', licenseUrl: 'https://rsms.me/' }
];

// Common font families and their typical sources
const COMMON_FONTS = {
  'arial': { type: 'system', source: 'system' },
  'helvetica': { type: 'system', source: 'system' },
  'times': { type: 'system', source: 'system' },
  'times new roman': { type: 'system', source: 'system' },
  'courier': { type: 'system', source: 'system' },
  'verdana': { type: 'system', source: 'system' },
  'georgia': { type: 'system', source: 'system' },
  'trebuchet ms': { type: 'system', source: 'system' },
  'impact': { type: 'system', source: 'system' },
  'comic sans ms': { type: 'system', source: 'system' },
  'tahoma': { type: 'system', source: 'system' },
  'geneva': { type: 'system', source: 'system' },
  'century gothic': { type: 'system', source: 'system' },
  'lucida console': { type: 'system', source: 'system' },
  'lucida sans unicode': { type: 'system', source: 'system' },
  'fangsong': { type: 'system', source: 'system' },
  'kaiti': { type: 'system', source: 'system' },
  'simhei': { type: 'system', source: 'system' },
  'simsun': { type: 'system', source: 'system' },
  'helvetica neue': { type: 'system', source: 'system' },
  'segoe ui': { type: 'system', source: 'system' },
  '-apple-system': { type: 'system', source: 'system' },
  'blinkmacsystemfont': { type: 'system', source: 'system' },
  'courier new': { type: 'system', source: 'system' },
  'apple color emoji': { type: 'system', source: 'system' },
  'segoe ui emoji': { type: 'system', source: 'system' },
  'segoe ui symbol': { type: 'system', source: 'system' },
  'noto color emoji': { type: 'system', source: 'system' }
};

/** CSS Fonts generic families (appear in stacks; no single file URL). */
const CSS_GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math'
]);

/**
 * Names often listed in font-family stacks that map to well-known open fonts
 * (actual rendering may still be a local/system fallback).
 */
const GOOGLE_OPEN_FONT_STACK_NAMES = new Set([
  'roboto',
  'noto sans',
  'noto serif',
  'noto sans jp',
  'noto sans kr',
  'noto sans sc',
  'noto sans tc',
  'open sans',
  'source sans 3',
  'source sans pro',
  'lato',
  'inter',
  'merriweather',
  'montserrat',
  'raleway',
  'ubuntu',
  'nunito',
  'poppins',
  'work sans',
  'dm sans',
  'manrope',
  'outfit'
]);

const CSS_GENERIC_SOURCE = {
  url: null,
  service: 'CSS generic family',
  license:
    'The browser picks a default font for this keyword; there is no single vendor URL for the keyword itself',
  licenseUrl: 'https://drafts.csswg.org/css-fonts/#generic-font-families'
};

/**
 * Extract font family from CSS font-family property
 */
function extractFontFamilies(fontFamilyString) {
  if (!fontFamilyString) return [];
  
  return fontFamilyString
    .split(',')
    .map(f => f.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter(f => f && f.length > 0);
}

/**
 * Map key so computed style names match @font-face names (e.g. "freight sans pro" vs "freight-sans-pro").
 * @param {string} family already lowercased from extractFontFamilies
 * @returns {string}
 */
function fontFamiliesMapKey(family) {
  const raw = String(family || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!raw) {
    return '';
  }
  return raw.replace(/[\s._-]+/g, '');
}

/**
 * Prefer a display name that looks like the webfont declaration (hyphenated) over the browser's spaced form.
 * @param {string} current
 * @param {string} incoming
 * @returns {string}
 */
function pickRicherFontFamilyLabel(current, incoming) {
  const cur = String(current || '');
  const inc = String(incoming || '');
  if (!inc) {
    return cur;
  }
  if (inc.includes('-') && !cur.includes('-')) {
    return inc;
  }
  return cur;
}

/**
 * Get font metadata by name (system fonts only — webfont sources come from URLs).
 */
function getFontMetadata(fontName) {
  const normalized = fontName.toLowerCase().trim();

  if (COMMON_FONTS[normalized]) {
    return COMMON_FONTS[normalized];
  }

  if (CSS_GENERIC_FAMILIES.has(normalized)) {
    return { type: 'generic', source: 'generic' };
  }

  if (GOOGLE_OPEN_FONT_STACK_NAMES.has(normalized)) {
    return { type: 'google-stack', source: 'google-fonts' };
  }

  return { type: 'custom', source: 'custom' };
}

/**
 * Detect font source from a font file or stylesheet URL.
 * @param {string} url
 * @param {string} [pageOrigin] window.location.origin of the tab (for same-origin labeling)
 */
function detectFontSource(url, pageOrigin) {
  if (!url) {
    return FONT_SERVICES.custom;
  }

  const lowerUrl = url.toLowerCase();

  for (const [key, service] of Object.entries(FONT_SERVICES)) {
    if (key === 'custom' || key === 'system') {
      continue;
    }

    for (const domain of service.domains) {
      if (lowerUrl.includes(domain)) {
        return service;
      }
    }
  }

  let host = '';
  try {
    const u = new URL(url, pageOrigin || undefined);
    host = (u.hostname || '').toLowerCase();
  } catch {
    return FONT_SERVICES.custom;
  }

  if (pageOrigin) {
    try {
      const page = new URL(pageOrigin);
      if (host && host === page.hostname.toLowerCase()) {
        return {
          name: 'This site (same origin)',
          license: 'Served from the same host as the page; license depends on the site',
          licenseUrl: null
        };
      }
    } catch {
      /* ignore */
    }
  }

  for (const hint of GENERIC_CDN_HOST_HINTS) {
    if (host.includes(hint.match)) {
      return {
        name: hint.name,
        license: 'Varies by upstream font license',
        licenseUrl: hint.licenseUrl || null
      };
    }
  }

  if (host) {
    return {
      name: `Remote host: ${host}`,
      license: 'Third-party host; license depends on the font vendor and agreement',
      licenseUrl: null
    };
  }

  return FONT_SERVICES.custom;
}

/**
 * Get computed font information for an element
 */
function getComputedFontInfo(element) {
  const style = window.getComputedStyle(element);
  
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    fontVariant: style.fontVariant,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    wordSpacing: style.wordSpacing,
    textRendering: style.textRendering
  };
}

/**
 * Get font face rules from stylesheets
 */
function getFontFaceRules() {
  const fontFaces = [];
  
  try {
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) {
          continue;
        }

        for (const rule of rules) {
          if (rule instanceof CSSFontFaceRule) {
            const style = rule.style;
            fontFaces.push({
              fontFamily: style.fontFamily,
              src: style.src,
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
              fontVariant: style.fontVariant,
              unicodeRange: style.unicodeRange,
              source: sheet.href || 'inline'
            });
          }
        }
      } catch (e) {
        // Cross-origin stylesheet, skip
        console.debug('Cannot access stylesheet:', sheet.href, e);
      }
    }
  } catch (e) {
    console.error('Error getting font face rules:', e);
  }
  
  return fontFaces;
}

function mergeFontFaceRuleIntoMap(fonts, rule) {
  const families = extractFontFamilies(rule.fontFamily);
  for (const family of families) {
    const key = fontFamiliesMapKey(family);
    if (!key) {
      continue;
    }
    if (!fonts.has(key)) {
      fonts.set(key, {
        fontFamily: family,
        sources: [],
        fontFaceRules: [rule],
        usedInElements: [],
        usageElementHits: 0
      });
    } else {
      const font = fonts.get(key);
      font.fontFaceRules = font.fontFaceRules || [];
      font.fontFaceRules.push(rule);
      font.fontFamily = pickRicherFontFamilyLabel(font.fontFamily, family);
    }
  }
}

function mergeFontFaceRulesIntoMap(fonts) {
  for (const rule of getFontFaceRules()) {
    mergeFontFaceRuleIntoMap(fonts, rule);
  }
}

/**
 * Stylesheet URLs the page references (extension background can fetch these without page CORS limits).
 */
function getExternalStylesheetHrefs() {
  if (typeof document === 'undefined') {
    return [];
  }

  const seen = new Set();
  const out = [];
  const sel =
    'link[rel="stylesheet"][href],link[rel="preload"][as="style"][href],link[rel="alternate stylesheet"][href]';
  const nodes = document.querySelectorAll(sel);

  for (const link of nodes) {
    const raw = link.getAttribute('href');
    if (!raw) {
      continue;
    }
    let abs;
    try {
      abs = new URL(raw, document.baseURI).href;
    } catch {
      continue;
    }
    if (!/^https?:/i.test(abs)) {
      continue;
    }
    if (seen.has(abs)) {
      continue;
    }
    seen.add(abs);
    out.push(abs);
  }

  return out;
}

function collectFontUrlsFromPerformance() {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
      return [];
    }
    const seen = new Set();
    const out = [];
    for (const e of performance.getEntriesByType('resource')) {
      const name = e && e.name ? String(e.name) : '';
      if (!name || !/\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(name)) {
        continue;
      }
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      out.push(name);
    }
    return out;
  } catch {
    return [];
  }
}

function matchPerformanceFontUrls(family, urls) {
  if (!urls || !urls.length) {
    return [];
  }

  const raw = String(family || '')
    .toLowerCase()
    .replace(/^["']|["']$/g, '')
    .trim();
  const variants = new Set();
  const compact = raw.replace(/[\s_\-'.]/g, '');
  if (compact.length >= 4) {
    variants.add(compact);
  }
  const slug = raw.replace(/\s+/g, '-');
  if (slug.length >= 4) {
    variants.add(slug);
  }
  const firstWord = raw.split(/[\s_-]+/)[0] || '';
  if (firstWord.length >= 4) {
    variants.add(firstWord);
  }

  const tokens = [...variants].filter(Boolean);
  if (!tokens.length) {
    return [];
  }

  const matched = [];
  for (const u of urls) {
    const lower = u.toLowerCase();
    for (const t of tokens) {
      if (t && lower.includes(t)) {
        matched.push(u);
        break;
      }
    }
  }

  return [...new Set(matched)].slice(0, 8);
}

/**
 * @param {Map} fonts
 * @param {NodeListOf<Element>|Element[]} list
 * @param {number} start inclusive
 * @param {number} end exclusive
 */
function appendElementFontsForRange(fonts, list, start, end) {
  for (let j = start; j < end; j++) {
    const element = list[j];
    let style;
    try {
      style = window.getComputedStyle(element);
    } catch (e) {
      continue;
    }
    const families = extractFontFamilies(style.fontFamily);

    for (const family of families) {
      const key = fontFamiliesMapKey(family);
      if (!key) {
        continue;
      }
      if (!fonts.has(key)) {
        fonts.set(key, {
          fontFamily: family,
          sources: [],
          fontFaceRules: [],
          usedInElements: [],
          usageElementHits: 0
        });
      }

      const font = fonts.get(key);
      font.fontFamily = pickRicherFontFamilyLabel(font.fontFamily, family);
      font.usedInElements = font.usedInElements || [];
      font.usageElementHits = (font.usageElementHits || 0) + 1;
      if (font.usedInElements.length < MAX_USAGE_RECORDS_PER_FAMILY) {
        font.usedInElements.push({
          selector: getSelector(element),
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle
        });
      }
    }
  }
}

function finalizeFontSourceInfo(fonts, pageOrigin) {
  const origin =
    pageOrigin || (typeof location !== 'undefined' ? location.origin : '');
  for (const [, font] of fonts) {
    font.sourceInfo = analyzeFontSource(font, origin, fonts);
  }
}

/**
 * Detect fonts used in the document (synchronous; for initial pass / tests).
 */
function detectFonts(options = {}) {
  const { scanRoot = false } = options;
  const fonts = new Map();

  mergeFontFaceRulesIntoMap(fonts);

  const root = scanRoot
    ? document.documentElement
    : document.body || document.documentElement;
  const list = root.querySelectorAll('*');
  appendElementFontsForRange(fonts, list, 0, list.length);

  finalizeFontSourceInfo(fonts, typeof location !== 'undefined' ? location.origin : '');

  return Array.from(fonts.values());
}

/** Stop recording every matching element after this (keeps memory sane on huge pages). */
const MAX_USAGE_RECORDS_PER_FAMILY = 220;

/** Smaller batches = more frequent UI yields on huge DOMs (HN, etc.). */
const ELEMENT_SCAN_BATCH = 320;

/**
 * Same as detectFonts but yields to the event loop between batches and reports progress.
 * @param {object} options
 * @param {(p: { phase: string, percent: number, detail?: string, current?: number, total?: number, uniqueFamilies?: number }) => void} onProgress
 * @returns {Promise<object[]>}
 */
async function detectFontsWithProgress(options = {}, onProgress, remoteRulesProvider) {
  const emit =
    typeof onProgress === 'function'
      ? onProgress
      : () => {
          /* noop */
        };
  const { scanRoot = false } = options;
  const fonts = new Map();
  const pageOrigin = typeof location !== 'undefined' ? location.origin : '';

  emit({ phase: 'stylesheet', percent: 0, detail: 'Reading @font-face rules…' });
  mergeFontFaceRulesIntoMap(fonts);

  emit({
    phase: 'remote',
    percent: 5,
    detail: 'Fetching cross-origin stylesheets…',
    uniqueFamilies: fonts.size
  });
  let remoteRules = [];
  if (typeof remoteRulesProvider === 'function') {
    try {
      remoteRules = await remoteRulesProvider();
    } catch (e) {
      console.debug('FontSource: remote stylesheet rules failed', e);
    }
  }
  if (Array.isArray(remoteRules) && remoteRules.length) {
    for (const rule of remoteRules) {
      mergeFontFaceRuleIntoMap(fonts, rule);
    }
  }

  emit({
    phase: 'stylesheet',
    percent: 12,
    detail: 'Stylesheets parsed',
    uniqueFamilies: fonts.size
  });

  const root = scanRoot
    ? document.documentElement
    : document.body || document.documentElement;
  const list = root.querySelectorAll('*');
  const total = list.length;

  emit({
    phase: 'elements',
    percent: 14,
    current: 0,
    total,
    uniqueFamilies: fonts.size,
    detail: total ? 'Scanning elements…' : 'No elements in document'
  });

  for (let start = 0; start < total; start += ELEMENT_SCAN_BATCH) {
    const end = Math.min(start + ELEMENT_SCAN_BATCH, total);
    appendElementFontsForRange(fonts, list, start, end);
    const pct = 14 + Math.floor((74 * end) / Math.max(total, 1));
    emit({
      phase: 'elements',
      percent: Math.min(90, pct),
      current: end,
      total,
      uniqueFamilies: fonts.size,
      detail: total ? `${end.toLocaleString()} / ${total.toLocaleString()} elements` : 'Done'
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  emit({
    phase: 'analyze',
    percent: 92,
    detail: 'Analyzing font sources…',
    uniqueFamilies: fonts.size
  });
  finalizeFontSourceInfo(fonts, pageOrigin);

  emit({
    phase: 'done',
    percent: 100,
    detail: 'Finished',
    uniqueFamilies: fonts.size
  });

  return Array.from(fonts.values());
}

/**
 * Build source rows from @font-face src:url(...) rules.
 * @param {object[]} rules
 * @param {string} pageOrigin
 */
function sourcesFromFontFaceRules(rules, pageOrigin) {
  const sources = [];
  const origin = pageOrigin || (typeof location !== 'undefined' ? location.origin : '');

  for (const rule of rules || []) {
    if (!rule.src) {
      continue;
    }
    const srcMatches = rule.src.match(/url\(['"]?([^'")]+)['"]?\)/g);
    if (!srcMatches) {
      continue;
    }
    for (const match of srcMatches) {
      const url = match.replace(/url\(['"]?|['"]?\)/g, '');
      if (/^data:/i.test(url)) {
        continue;
      }
      const source = detectFontSource(url, origin);
      sources.push({
        url: url,
        service: source.name,
        license: source.license,
        licenseUrl: source.licenseUrl
      });
    }
  }

  return sources;
}

/**
 * Next.js / bundlers often emit a paired @font-face with only local() for metrics (…_fallback_…).
 * Map that synthetic family to the hashed webfont sibling (… without _fallback_).
 */
function nextNonFallbackFontfaceSiblingKey(familyName) {
  const n = String(familyName || '').toLowerCase();
  const m = n.match(/^(.*)_fallback(_[a-f0-9]+)$/);
  if (!m) {
    return null;
  }
  return m[1] + m[2];
}

/**
 * Analyze font source from @font-face URLs, Performance entries, then system metadata.
 * @param {object} font
 * @param {string} pageOrigin
 * @param {Map} [fontsMap] optional full scan map (pairs fallback faces with real file URLs)
 */
function analyzeFontSource(font, pageOrigin, fontsMap) {
  const sources = [];
  const origin = pageOrigin || (typeof location !== 'undefined' ? location.origin : '');

  sources.push(...sourcesFromFontFaceRules(font.fontFaceRules, origin));

  if (sources.length === 0 && fontsMap && typeof fontsMap.get === 'function') {
    const siblingRaw = nextNonFallbackFontfaceSiblingKey(font.fontFamily);
    const siblingKey = siblingRaw ? fontFamiliesMapKey(siblingRaw) : '';
    if (siblingKey && fontsMap.has(siblingKey)) {
      const sibling = fontsMap.get(siblingKey);
      sources.push(...sourcesFromFontFaceRules(sibling.fontFaceRules, origin));
    }
  }

  if (sources.length === 0) {
    const perfUrls = collectFontUrlsFromPerformance();
    const matched = matchPerformanceFontUrls(font.fontFamily, perfUrls);
    for (const url of matched) {
      const source = detectFontSource(url, origin);
      sources.push({
        url,
        service: source.name,
        license: source.license,
        licenseUrl: source.licenseUrl
      });
    }
  }

  if (sources.length === 0) {
    const metadata = getFontMetadata(font.fontFamily);
    if (metadata.type === 'generic') {
      sources.push({ ...CSS_GENERIC_SOURCE });
    } else if (metadata.type === 'google-stack') {
      const g = FONT_SERVICES['google-fonts'];
      sources.push({
        url: null,
        service: `${g.name} (CSS name)`,
        license: `${g.license} Shown as a stack fallback here; the browser may use a local install rather than fonts.gstatic.com.`,
        licenseUrl: g.licenseUrl
      });
    } else if (metadata.source !== 'custom') {
      const service = FONT_SERVICES[metadata.source];
      if (service) {
        sources.push({
          url: null,
          service: service.name,
          license: service.license,
          licenseUrl: service.licenseUrl
        });
      }
    }
  }

  if (sources.length === 0) {
    sources.push({
      url: null,
      service: 'Unknown source',
      license:
        'Could not tie this family to a font file URL (blocked cross-origin CSS, local font, or opaque load)',
      licenseUrl: null
    });
  }

  return sources;
}

/**
 * Get CSS selector for element
 */
const MAX_SELECTOR_SEGMENT_LEN = 96;

function truncateSelectorSegment(s) {
  const t = String(s || '');
  if (t.length <= MAX_SELECTOR_SEGMENT_LEN) {
    return t;
  }
  return `${t.slice(0, MAX_SELECTOR_SEGMENT_LEN - 1)}…`;
}

function getSelector(element) {
  if (element.id) {
    return truncateSelectorSegment(`#${element.id}`);
  }

  const parts = [];
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter((c) => c);
      if (classes.length > 0) {
        const joined = classes.slice(0, 2).join('.');
        selector += `.${joined}`;
      }
    }

    parts.unshift(truncateSelectorSegment(selector));
    current = current.parentElement;

    if (parts.length > 3) break;
  }

  return parts.join(' > ');
}

/**
 * Get page URL information
 */
function getPageUrlInfo() {
  return {
    currentUrl: window.location.href,
    origin: window.location.origin,
    pathname: window.location.pathname,
    protocol: window.location.protocol
  };
}

// Same isolated-world globals content.js expects; keeps these bindings “used” for ESLint.
Object.assign(globalThis, {
  detectFonts,
  detectFontsWithProgress,
  getExternalStylesheetHrefs,
  getComputedFontInfo,
  getPageUrlInfo
});