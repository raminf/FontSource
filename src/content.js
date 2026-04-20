/**
 * Content Script
 * Runs on the target webpage to detect fonts
 */

// Store for detected fonts
let detectedFonts = [];
let scanOptions = {
  scanRoot: false
};

/**
 * Initialize content script
 */
function init() {
  console.log('FontSource: Content script initialized');
  
  // Listen for messages from background
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(handleMessage);
  }
  
  // Auto-detect fonts on page load
  detectFontsOnPage();
}

/**
 * Handle messages from background script
 */
function handleMessage(request, sender, sendResponse) {
  switch (request.action) {
    case 'getFonts':
      sendResponse({ fonts: detectedFonts, options: scanOptions });
      return true;
      
    case 'scanPage':
      scanOptions = request.options || { scanRoot: false };
      detectedFonts = detectFonts(scanOptions);
      sendResponse({ fonts: detectedFonts });
      return true;
      
    case 'getOptions':
      sendResponse({ options: scanOptions });
      return true;
      
    case 'setOptions':
      scanOptions = request.options || { scanRoot: false };
      sendResponse({ success: true });
      return true;
  }
}

/**
 * Detect fonts on current page
 */
function detectFontsOnPage() {
  console.log('FontSource: Detecting fonts on page');
  detectedFonts = detectFonts(scanOptions);
  console.log('FontSource: Found', detectedFonts.length, 'fonts');
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
    init,
    detectFontsOnPage,
    getFonts,
    getOptions,
    scanOptions
  };
}

// Initialize on load
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}