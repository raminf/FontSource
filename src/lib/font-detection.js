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
    domains: ['use.typekit.net', 'use.typekit.com', 'typekit.net', 'fonts.adobe.com'],
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
  }
};

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
  'simsun': { type: 'system', source: 'system' }
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
 * Get font metadata by name
 */
function getFontMetadata(fontName) {
  const normalized = fontName.toLowerCase().trim();
  
  // Check common fonts first
  if (COMMON_FONTS[normalized]) {
    return COMMON_FONTS[normalized];
  }
  
  // Check for Google Fonts patterns
  const googleFonts = [
    'roboto', 'opensans', 'lato', 'merriweather', 'playfair', 'montserrat',
    'poppins', 'source sans', 'ubuntu', 'noto', 'raleway', 'oswald',
    'quicksand', 'nunito', 'inter', 'dm sans', 'manrope', 'outfit',
    'bebas', 'cinzel', 'dm serif', 'playfair display', 'rubik'
  ];
  
  for (const font of googleFonts) {
    if (normalized.includes(font)) {
      return { type: 'google-fonts', source: 'google-fonts' };
    }
  }
  
  // Check for Adobe Typekit patterns
  const typekitFonts = [
    'adobe', 'typekit', 'minion', 'myriad', 'adobe caslon',
    'adobe garamond', 'adobe hebrew', 'adobe kaiti', 'adobe song'
  ];
  
  for (const font of typekitFonts) {
    if (normalized.includes(font)) {
      return { type: 'adobe-typekit', source: 'adobe-typekit' };
    }
  }
  
  return { type: 'custom', source: 'custom' };
}

/**
 * Detect font source from URL
 */
function detectFontSource(url) {
  if (!url) return FONT_SERVICES.custom;
  
  const lowerUrl = url.toLowerCase();
  
  for (const [key, service] of Object.entries(FONT_SERVICES)) {
    if (key === 'custom') continue;
    
    for (const domain of service.domains) {
      if (lowerUrl.includes(domain)) {
        return service;
      }
    }
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

/**
 * Detect fonts used in the document
 */
function detectFonts(options = {}) {
  const { scanRoot = false } = options;
  const fonts = new Map();
  
  // Get font-face rules
  const fontFaceRules = getFontFaceRules();
  
  for (const rule of fontFaceRules) {
    const families = extractFontFamilies(rule.fontFamily);
    for (const family of families) {
      if (!fonts.has(family)) {
        fonts.set(family, {
          fontFamily: family,
          sources: [],
          fontFaceRules: [rule]
        });
      }
    }
  }
  
  // Get all elements and their computed fonts
  const elements = scanRoot 
    ? document.querySelectorAll('*')
    : document.body.querySelectorAll('*');
  
  for (const element of elements) {
    const style = window.getComputedStyle(element);
    const families = extractFontFamilies(style.fontFamily);
    
    for (const family of families) {
      if (!fonts.has(family)) {
        fonts.set(family, {
          fontFamily: family,
          sources: [],
          fontFaceRules: [],
          usedInElements: []
        });
      }
      
      const font = fonts.get(family);
      font.usedInElements = font.usedInElements || [];
      font.usedInElements.push({
        selector: getSelector(element),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle
      });
    }
  }
  
  // Analyze sources for each font
  for (const [family, font] of fonts) {
    font.sourceInfo = analyzeFontSource(font);
  }
  
  return Array.from(fonts.values());
}

/**
 * Analyze font source
 */
function analyzeFontSource(font) {
  const sources = [];
  
  // Check font-face rules for sources
  for (const rule of (font.fontFaceRules || [])) {
    if (rule.src) {
      const srcMatches = rule.src.match(/url\(['"]?([^'")]+)['"]?\)/g);
      if (srcMatches) {
        for (const match of srcMatches) {
          const url = match.replace(/url\(['"]?|['"]?\)/g, '');
          const source = detectFontSource(url);
          sources.push({
            url: url,
            service: source.name,
            license: source.license,
            licenseUrl: source.licenseUrl
          });
        }
      }
    }
  }
  
  // If no sources found from font-face, check common services
  if (sources.length === 0) {
    const metadata = getFontMetadata(font.fontFamily);
    if (metadata.source !== 'custom') {
      const service = FONT_SERVICES[metadata.source];
      sources.push({
        url: null,
        service: service.name,
        license: service.license,
        licenseUrl: service.licenseUrl
      });
    }
  }
  
  // Default to custom if no sources found
  if (sources.length === 0) {
    sources.push({
      url: null,
      service: 'Custom / Self-hosted',
      license: 'Varies by font',
      licenseUrl: null
    });
  }
  
  return sources;
}

/**
 * Get CSS selector for element
 */
function getSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  
  const parts = [];
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();
    
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        selector += '.' + classes.slice(0, 2).join('.');
      }
    }
    
    parts.unshift(selector);
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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectFonts,
    getFontFaceRules,
    getComputedFontInfo,
    extractFontFamilies,
    getFontMetadata,
    detectFontSource,
    analyzeFontSource,
    FONT_SERVICES,
    COMMON_FONTS,
    getPageUrlInfo
  };
}