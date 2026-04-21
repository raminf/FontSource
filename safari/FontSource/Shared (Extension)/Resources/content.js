/**
 * Content Script
 * Runs on the target webpage to detect fonts
 */

(function fontSourceContentScript() {
  'use strict';

// Store for detected fonts
let detectedFonts = [];
let scanOptions = {
  scanRoot: false
};

/** Large pages (e.g. long comment threads) produce huge payloads; Chrome drops oversized messages with no clear error. */
const MAX_FONTS_IN_MESSAGE = 280;
const MAX_USAGE_SAMPLES = 24;
const MAX_FONT_FACE_RULES = 12;
const MAX_SRC_CHARS_IN_TRANSFER = 720;

/**
 * Shrink font scan results to a safe size for extension messaging (structured clone).
 */
function compactFontsForTransfer(fonts) {
  if (!Array.isArray(fonts)) {
    return [];
  }

  return fonts.slice(0, MAX_FONTS_IN_MESSAGE).map((f) => {
    const used = f.usedInElements || [];
    const usageTotal =
      typeof f.usageElementHits === 'number' ? f.usageElementHits : used.length;
    const samples = used.slice(0, MAX_USAGE_SAMPLES).map((u) => ({
      selector: String(u.selector || ''),
      fontSize: String(u.fontSize || ''),
      fontWeight: String(u.fontWeight || ''),
      fontStyle: String(u.fontStyle || '')
    }));

    const rules = (f.fontFaceRules || []).slice(0, MAX_FONT_FACE_RULES).map((r) => {
      const srcRaw = String(r.src || '');
      const src =
        srcRaw.length > MAX_SRC_CHARS_IN_TRANSFER
          ? `${srcRaw.slice(0, MAX_SRC_CHARS_IN_TRANSFER)}…`
          : srcRaw;
      return {
        fontFamily: r.fontFamily,
        src,
        fontWeight: r.fontWeight,
        fontStyle: r.fontStyle,
        fontVariant: r.fontVariant,
        unicodeRange: r.unicodeRange,
        source: typeof r.source === 'string' ? r.source : 'inline'
      };
    });

    const srcInfo = f.sourceInfo;
    let sourceInfo = srcInfo;
    if (Array.isArray(srcInfo)) {
      sourceInfo = srcInfo.slice(0, 10).map((s) => ({
        url: s.url,
        service: s.service,
        license: s.license,
        licenseUrl: s.licenseUrl
      }));
    }

    return {
      fontFamily: f.fontFamily,
      fontFaceRules: rules,
      usedInElements: samples,
      usageElementCount: usageTotal,
      sourceInfo
    };
  });
}

function extensionRuntime() {
  if (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime) {
    return globalThis.browser;
  }
  if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome.runtime) {
    return globalThis.chrome;
  }
  return null;
}

function safeSendResponse(sendResponse, payload) {
  try {
    sendResponse(payload);
    return true;
  } catch (e) {
    console.warn('FontSource: sendResponse failed', e);
    try {
      sendResponse({
        error:
          'Scan result was too large to send back to the popup. Try a shorter page or fewer open tabs.',
        errorName: 'MessageSizeError'
      });
    } catch (e2) {
      /* message channel may already be closed */
    }
    return false;
  }
}

function fetchRemoteRulesViaBackground() {
  return new Promise((resolve) => {
    const rt = extensionRuntime();
    const hrefs =
      typeof getExternalStylesheetHrefs === 'function' ? getExternalStylesheetHrefs() : [];
    if (!rt || !rt.runtime || !rt.runtime.sendMessage) {
      resolve([]);
      return;
    }
    try {
      rt.runtime.sendMessage({ action: 'fetchRemoteFontFaces', hrefs }, (r) => {
        if (rt.runtime.lastError) {
          resolve([]);
          return;
        }
        resolve((r && r.rules) || []);
      });
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * Initial scan must not block the tab thread: huge pages (e.g. HN comment threads) would
 * freeze synchronous detectFonts() and the background would time out waiting for scanPage.
 */
function runInitialFontDetection() {
  console.log('FontSource: Content script ready');
  setTimeout(() => {
    void (async () => {
      try {
        const raw = await detectFontsWithProgress(scanOptions, () => {}, fetchRemoteRulesViaBackground);
        detectedFonts = raw;
        console.log('FontSource: Initial scan done,', raw.length, 'fonts');
      } catch (e) {
        console.error('FontSource: Initial font detection failed', e);
        detectedFonts = [];
      }
    })();
  }, 0);
}

function createThrottledProgressEmitter() {
  const rt = extensionRuntime();
  let lastEmit = 0;
  return (payload) => {
    const force =
      payload &&
      (payload.phase === 'start' ||
        payload.phase === 'done' ||
        payload.phase === 'error' ||
        payload.phase === 'analyze');
    const now = Date.now();
    if (!force && now - lastEmit < 110) {
      return;
    }
    lastEmit = now;
    if (!rt || !rt.runtime || !rt.runtime.sendMessage) {
      return;
    }
    try {
      rt.runtime.sendMessage({
        action: 'fontScanProgress',
        payload
      });
    } catch (e) {
      /* ignore */
    }
  };
}

/**
 * Handle messages from background script
 */
function handleMessage(request, sender, sendResponse) {
  switch (request.action) {
    case 'getFonts':
      safeSendResponse(sendResponse, {
        fonts: compactFontsForTransfer(detectedFonts),
        options: scanOptions
      });
      return false;

    case 'scanPage': {
      scanOptions = request.options || { scanRoot: false };
      let replied = false;
      const replyOnce = (payload) => {
        if (replied) {
          return;
        }
        replied = true;
        safeSendResponse(sendResponse, payload);
      };
      const emitProgress = createThrottledProgressEmitter();

      (async () => {
        try {
          emitProgress({ phase: 'start', percent: 0, detail: 'Starting scan…' });
          const raw = await detectFontsWithProgress(
            scanOptions,
            emitProgress,
            fetchRemoteRulesViaBackground
          );
          detectedFonts = raw;
          replyOnce({ fonts: compactFontsForTransfer(raw) });
        } catch (e) {
          console.error('FontSource: scanPage failed', e);
          emitProgress({
            phase: 'error',
            percent: 0,
            detail: e && e.message ? e.message : String(e)
          });
          replyOnce({
            error: e && e.message ? e.message : String(e),
            errorName: e && e.name ? e.name : 'Error'
          });
        }
      })();

      return true;
    }

    case 'getOptions':
      sendResponse({ options: scanOptions });
      return false;

    case 'setOptions':
      scanOptions = request.options || { scanRoot: false };
      sendResponse({ success: true });
      return false;

    default:
      return false;
  }
}

const fontSourceExtension = extensionRuntime();

/**
 * (Re)bind the runtime listener. Programmatic re-inject and bfcache restore must not skip
 * registration because a stale global flag would leave no handler for tabs.sendMessage.
 */
function attachMessageListener() {
  if (typeof window === 'undefined' || !fontSourceExtension) {
    return;
  }
  const prev = globalThis.__FONT_SOURCE_MSG_HANDLER__;
  if (prev) {
    try {
      fontSourceExtension.runtime.onMessage.removeListener(prev);
    } catch (e) {
      /* ignore */
    }
  }
  globalThis.__FONT_SOURCE_MSG_HANDLER__ = handleMessage;
  fontSourceExtension.runtime.onMessage.addListener(handleMessage);
}

attachMessageListener();

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pageshow',
    (event) => {
      if (!event.persisted) {
        return;
      }
      detectedFonts = [];
      attachMessageListener();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInitialFontDetection, { once: true });
      } else {
        runInitialFontDetection();
      }
    },
    false
  );
}

/**
 * Detect fonts on current page
 */
function detectFontsOnPage() {
  console.log('FontSource: Detecting fonts on page');
  try {
    detectedFonts = detectFonts(scanOptions);
    console.log('FontSource: Found', detectedFonts.length, 'fonts');
  } catch (e) {
    console.error('FontSource: detectFontsOnPage failed', e);
    detectedFonts = [];
  }
}

/**
 * Get detected fonts
 */
function getFonts() {
  return detectedFonts;
}

/**
 * Get scan options
 */
function getOptions() {
  return scanOptions;
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    init: runInitialFontDetection,
    detectFontsOnPage,
    getFonts,
    getOptions,
    scanOptions,
    compactFontsForTransfer
  };
}

/**
 * Run initial detection once the document is far enough along. The message listener is
 * already registered above so the popup never hits "No response from the page script"
 * while waiting for DOMContentLoaded (common on heavy SPAs like svgrepo.com).
 * Guarded so programmatic re-injection does not double-schedule work.
 */
if (typeof window !== 'undefined' && !globalThis.__FONT_SOURCE_BOOT_ONCE__) {
  globalThis.__FONT_SOURCE_BOOT_ONCE__ = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInitialFontDetection, { once: true });
  } else {
    runInitialFontDetection();
  }
}

})();
