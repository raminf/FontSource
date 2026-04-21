/**
 * Well-known HTTPS sites for extension smoke tests (real network).
 * Thresholds are intentionally low to reduce churn when sites restyle.
 */

/** @typedef {{ id: string, startUrl: string, hostContains: string, minFontFamilies: number, minFontsWithUsageSamples?: number, waitUntil?: 'domcontentloaded' | 'load', settleMs?: number }} PublicSiteCase */

/** @returns {string} unique hash so multiple tabs never share the same chrome.tabs URL */
export function withSmokeTabHash(url) {
  const u = new URL(url);
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  u.hash = `fontsource-smoke=${token}`;
  return u.href;
}

/** @type {PublicSiteCase[]} */
export const PUBLIC_SITE_SMOKE_CASES = [
  {
    id: 'example_com',
    startUrl: 'https://example.com/',
    hostContains: 'example.com',
    minFontFamilies: 1,
    minFontsWithUsageSamples: 1
  },
  {
    id: 'w3c_www',
    startUrl: 'https://www.w3.org/',
    hostContains: 'w3.org',
    minFontFamilies: 2,
    minFontsWithUsageSamples: 1,
    waitUntil: 'domcontentloaded',
    settleMs: 1200
  },
  {
    id: 'wikipedia_portal',
    startUrl: 'https://www.wikipedia.org/',
    hostContains: 'wikipedia.org',
    minFontFamilies: 3,
    minFontsWithUsageSamples: 1,
    waitUntil: 'load',
    settleMs: 1500
  }
];
