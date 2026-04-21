/**
 * Parse @font-face blocks from raw CSS (used in the extension service worker).
 * No DOM; safe for importScripts from background.js.
 */

function stripCssComments(cssText) {
  return String(cssText).replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function takeValueUntilNextDeclaration(str, start) {
  let i = start;
  let depth = 0;
  let quote = null;

  for (; i < str.length; i++) {
    const c = str[i];
    const prev = i > 0 ? str[i - 1] : '';

    if (quote) {
      if (c === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }

    if (c === '"' || c === '\'') {
      quote = c;
      continue;
    }

    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
    } else if (c === ';' && depth === 0) {
      return str.slice(start, i).trim();
    }
  }

  return str.slice(start).trim();
}

function extractDeclarationInBlock(block, propName) {
  const esc = String(propName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|;)\\s*' + esc + '\\s*:\\s*', 'i');
  const m = re.exec(block);
  if (!m) {
    return '';
  }
  return takeValueUntilNextDeclaration(block, m.index + m[0].length);
}

function resolveUrlsInSrcDeclaration(value, baseUrl) {
  if (!value || !baseUrl) {
    return value;
  }

  return value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, path) => {
    const p = String(path).trim();
    if (!p || /^data:/i.test(p)) {
      return full;
    }
    try {
      const abs = new URL(p, baseUrl).href;
      return `url("${abs}")`;
    } catch {
      return full;
    }
  });
}

function parseFontFaceBlockInner(inner, sheetUrl) {
  const fontFamilyRaw = extractDeclarationInBlock(inner, 'font-family');
  const srcRaw = extractDeclarationInBlock(inner, 'src');
  if (!fontFamilyRaw || !srcRaw) {
    return null;
  }

  const fontWeight = extractDeclarationInBlock(inner, 'font-weight') || 'normal';
  const fontStyle = extractDeclarationInBlock(inner, 'font-style') || 'normal';

  return {
    fontFamily: fontFamilyRaw.trim(),
    src: resolveUrlsInSrcDeclaration(srcRaw.trim(), sheetUrl),
    fontWeight: String(fontWeight).trim(),
    fontStyle: String(fontStyle).trim(),
    source: sheetUrl
  };
}

/**
 * @param {string} cssText
 * @param {string} baseUrl absolute URL of the stylesheet (for resolving relative url()).
 * @returns {Array<{ fontFamily: string, src: string, fontWeight: string, fontStyle: string, source: string }>}
 */
function parseFontFacesFromCss(cssText, baseUrl) {
  const results = [];
  if (!cssText || typeof cssText !== 'string' || !baseUrl) {
    return results;
  }

  const text = stripCssComments(cssText);
  const re = /@font-face\s*\{/gi;
  let m;

  while ((m = re.exec(text)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    let depth = 1;
    let i = openBrace + 1;

    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) {
          const inner = text.slice(openBrace + 1, i);
          const parsed = parseFontFaceBlockInner(inner, baseUrl);
          if (parsed) {
            results.push(parsed);
          }
          break;
        }
      }
    }
  }

  return results;
}

/** Exposed for background.js after importScripts (classic script global). */
globalThis.parseFontFacesFromCss = parseFontFacesFromCss;
