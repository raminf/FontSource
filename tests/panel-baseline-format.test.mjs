import { describe, it, expect } from 'vitest';
import { formatPanelBaselineFromFonts } from './lib/panel-baseline-format.mjs';

describe('formatPanelBaselineFromFonts', () => {
  it('sorts by family and formats stable blocks', () => {
    const text = formatPanelBaselineFromFonts([
      {
        fontFamily: 'Zebra',
        sourceInfo: [{ service: 'S1', license: 'L1', url: 'https://x.test/a' }],
        usedInElements: [{ selector: 'div.a' }],
        usageElementHits: 2
      },
      {
        fontFamily: 'Alpha',
        sourceInfo: [{ service: 'S2', license: 'L2', url: '' }],
        usedInElements: [{ selector: 'p' }, { selector: 'main' }]
      }
    ]);
    expect(text.startsWith('family: Alpha')).toBe(true);
    expect(text).toContain('family: Zebra');
    expect(text).toContain('usageElements: 2');
    expect(text).toContain('https://x.test/a');
    expect(text.endsWith('\n')).toBe(true);
  });
});
