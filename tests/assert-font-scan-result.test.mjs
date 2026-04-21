import { describe, it, expect } from 'vitest';
import {
  validateFontScanPayload,
  assertUrlHostContains
} from './lib/assert-font-scan-result.mjs';
import { withSmokeTabHash } from './lib/public-site-cases.mjs';

describe('validateFontScanPayload', () => {
  it('accepts a compact-shaped payload', () => {
    const fonts = [
      {
        fontFamily: 'Arial',
        usedInElements: [{ selector: 'body' }],
        fontFaceRules: [],
        usageElementCount: 3,
        sourceInfo: [{ service: 'S', license: 'L', url: '' }]
      }
    ];
    expect(validateFontScanPayload(fonts, { minFontFamilies: 1 }).ok).toBe(true);
  });

  it('rejects missing usage', () => {
    const fonts = [
      {
        fontFamily: 'Arial',
        usedInElements: [],
        fontFaceRules: [],
        usageElementCount: 0,
        sourceInfo: []
      }
    ];
    const r = validateFontScanPayload(fonts, { minFontFamilies: 1, minFontsWithUsageSamples: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/usage/i);
  });

  it('rejects malformed entries', () => {
    const r = validateFontScanPayload([{ fontFamily: '' }], { minFontFamilies: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/fontFamily/);
  });
});

describe('assertUrlHostContains', () => {
  it('checks hostname', () => {
    expect(() => assertUrlHostContains('https://example.com/path', 'example.com')).not.toThrow();
    expect(() => assertUrlHostContains('https://evil.com', 'example.com')).toThrow();
  });
});

describe('withSmokeTabHash', () => {
  it('adds a stable-looking hash fragment', () => {
    const u = withSmokeTabHash('https://example.com/');
    expect(u).toMatch(/^https:\/\/example\.com\/#fontsource-smoke=/);
  });
});
