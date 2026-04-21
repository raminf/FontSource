/**
 * Stable text snapshot of font listing panel semantics (family, primary source, license, etc.).
 * Used for baseline record/diff — not raw HTML, so previews and markup churn do not affect diffs.
 */

/**
 * @param {string} s
 * @param {number} max
 */
function truncate(s, max) {
  const t = String(s || '');
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max - 1)}…`;
}

/**
 * @param {unknown} fonts
 * @returns {string}
 */
export function formatPanelBaselineFromFonts(fonts) {
  if (!Array.isArray(fonts)) {
    return '';
  }

  const rows = [...fonts].sort((a, b) =>
    String(a?.fontFamily || '').localeCompare(String(b?.fontFamily || ''), 'en')
  );

  const blocks = rows.map((f) => {
    const fam = String(f?.fontFamily || '').trim();
    const sources = Array.isArray(f?.sourceInfo) ? f.sourceInfo : [];
    const primary = sources[0] || {
      service: 'Custom / Self-hosted',
      license: 'Varies by font',
      url: ''
    };
    const used = Array.isArray(f?.usedInElements) ? f.usedInElements : [];
    const usageHits =
      typeof f?.usageElementHits === 'number'
        ? f.usageElementHits
        : typeof f?.usageElementCount === 'number'
          ? f.usageElementCount
          : used.length;
    const selectors = used
      .map((u) => String(u?.selector || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .slice(0, 8);

    const lines = [
      `family: ${fam}`,
      `service: ${String(primary.service || '').trim()}`,
      `license: ${String(primary.license || '').trim()}`,
      `url: ${truncate(primary.url || '', 120)}`,
      `usageElements: ${usageHits}`,
      `selectorsSample: ${selectors.join(' | ')}`
    ];

    return lines.join('\n');
  });

  return `${blocks.join('\n---\n')}\n`;
}
