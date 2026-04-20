/**
 * Background Script
 * Manages extension state, handles messages, and coordinates between components
 */

// Extension state
let state = {
  scanOptions: {
    scanRoot: false
  },
  recentUrls: []
};

// Load state from storage
function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['scanOptions', 'recentUrls'], (result) => {
      if (result.scanOptions) {
        state.scanOptions = result.scanOptions;
      }
      if (result.recentUrls) {
        state.recentUrls = result.recentUrls;
      }
      resolve(state);
    });
  });
}

// Save state to storage
function saveState() {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      scanOptions: state.scanOptions,
      recentUrls: state.recentUrls
    }, () => {
      resolve();
    });
  });
}

// Update scan options
function updateScanOptions(options) {
  state.scanOptions = { ...state.scanOptions, ...options };
  saveState();
  return state.scanOptions;
}

// Add URL to recent
function addRecentUrl(url) {
  if (!url || !url.startsWith('http')) return;
  
  // Remove if already exists
  state.recentUrls = state.recentUrls.filter(u => u !== url);
  
  // Add to beginning
  state.recentUrls.unshift(url);
  
  // Keep only last 10
  if (state.recentUrls.length > 10) {
    state.recentUrls = state.recentUrls.slice(0, 10);
  }
  
  saveState();
}

// Get recent URLs
function getRecentUrls() {
  return state.recentUrls;
}

// Get current tab URL
function getCurrentTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        resolve(tabs[0].url);
      } else {
        resolve(null);
      }
    });
  });
}

// Get page origin from URL
function getPageOrigin(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + '/';
  } catch (e) {
    return null;
  }
}

// Send message to content script
function sendMessageToContent(action, data = {}) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action, ...data }, (response) => {
          resolve(response);
        });
      } else {
        resolve(null);
      }
    });
  });
}

// Scan current page for fonts
async function scanCurrentPage(options = {}) {
  const currentUrl = await getCurrentTabUrl();
  
  if (!currentUrl) {
    return { error: 'No active tab found' };
  }
  
  // Update scan options if provided
  if (Object.keys(options).length > 0) {
    updateScanOptions(options);
  }
  
  // Get fonts from content script
  const response = await sendMessageToContent('scanPage', { options: state.scanOptions });
  
  if (response && response.fonts) {
    addRecentUrl(currentUrl);
    return { fonts: response.fonts, url: currentUrl };
  }
  
  return { error: 'Failed to scan page' };
}

// Initialize on extension load
loadState().then(() => {
  console.log('FontSource: Background script initialized');
  console.log('FontSource: Scan options loaded:', state.scanOptions);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getState':
      sendResponse({ state });
      return true;
      
    case 'updateState':
      if (request.scanOptions) {
        updateScanOptions(request.scanOptions);
      }
      sendResponse({ success: true, state });
      return true;
      
    case 'getRecentUrls':
      sendResponse({ urls: getRecentUrls() });
      return true;
      
    case 'scanPage':
      scanCurrentPage(request.options).then(result => {
        sendResponse(result);
      });
      return true;
      
    case 'getCurrentUrl':
      getCurrentTabUrl().then(url => {
        sendResponse({ url });
      });
      return true;
      
    case 'getPageOrigin':
      const url = request.url || state.recentUrls[0];
      sendResponse({ origin: getPageOrigin(url) });
      return true;
  }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    console.log('FontSource: Tab updated:', tab.url);
  }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadState,
    saveState,
    updateScanOptions,
    addRecentUrl,
    getRecentUrls,
    getCurrentTabUrl,
    getPageOrigin,
    sendMessageToContent,
    scanCurrentPage
  };
}