/**
 * Structural checks for compact font payloads from the content script (via background scan).
 * Keeps Playwright integration and vitest unit tests aligned on what "complete" data means.
 */

/**
 * @param {unknown} f
 * @returns {string[]}
 */
function validationErrorsForFontEntry(f) {
  const errors = [];
  if (!f || typeof f !== 'object') {
    return ['entry is not an object'];
  }
  const o = /** @type {Record<string, unknown>} */ (f);
  if (typeof o.fontFamily !== 'string' || !o.fontFamily.trim()) {
    errors.push('fontFamily must be a non-empty string');
  }
  if (!Array.isArray(o.usedInElements)) {
    errors.push('usedInElements must be an array');
  }
  if (!Array.isArray(o.fontFaceRules)) {
    errors.push('fontFaceRules must be an array');
  }
  if (o.sourceInfo != null && !Array.isArray(o.sourceInfo)) {
    errors.push('sourceInfo must be an array when present');
  }
  return errors;
}

/**
 * @param {unknown[]} fonts
 * @param {{ minFontFamilies?: number, minFontsWithUsageSamples?: number }} [spec]
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateFontScanPayload(fonts, spec = {}) {
  const minFontFamilies = spec.minFontFamilies ?? 1;
  const minFontsWithUsageSamples = spec.minFontsWithUsageSamples ?? 1;

  if (!Array.isArray(fonts)) {
    return { ok: false, message: 'fonts must be an array' };
  }
  if (fonts.length < minFontFamilies) {
    return {
      ok: false,
      message: `expected at least ${minFontFamilies} font families, got ${fonts.length}`
    };
  }

  for (let i = 0; i < fonts.length; i++) {
    const problems = validationErrorsForFontEntry(fonts[i]);
    if (problems.length) {
      return { ok: false, message: `fonts[${i}]: ${problems.join('; ')}` };
    }
  }

  let withUsage = 0;
  for (const f of fonts) {
    const o = /** @type {{ usedInElements?: unknown[]; usageElementCount?: unknown }} */ (f);
    const used = Array.isArray(o.usedInElements) ? o.usedInElements : [];
    const count =
      typeof o.usageElementCount === 'number' && o.usageElementCount > 0
        ? o.usageElementCount
        : used.length;
    if (used.length > 0 || count > 0) {
      withUsage++;
    }
  }

  if (withUsage < minFontsWithUsageSamples) {
    return {
      ok: false,
      message: `expected at least ${minFontsWithUsageSamples} fonts with usage samples, got ${withUsage}`
    };
  }

  return { ok: true };
}

/**
 * @param {unknown[]} fonts
 * @param {{ minFontFamilies?: number, minFontsWithUsageSamples?: number }} [spec]
 */
export function assertFontScanPayload(fonts, spec) {
  const r = validateFontScanPayload(fonts, spec);
  if (!r.ok) {
    throw new Error(r.message);
  }
}

/**
 * @param {string} scannedUrl
 * @param {string} hostSubstring e.g. "example.com"
 */
export function assertUrlHostContains(scannedUrl, hostSubstring) {
  let host = '';
  try {
    host = new URL(scannedUrl).hostname;
  } catch {
    throw new Error(`scanned URL is not parseable: ${scannedUrl}`);
  }
  if (!host.includes(hostSubstring)) {
    throw new Error(`expected hostname to include "${hostSubstring}", got "${host}" from ${scannedUrl}`);
  }
}
