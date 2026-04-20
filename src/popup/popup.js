/**
 * Popup Script
 * Handles popup UI interactions and font display
 */

// DOM Elements
const urlInput = document.getElementById('urlInput');
const scanBtn = document.getElementById('scanBtn');
const recentUrls = document.getElementById('recentUrls');
const resultsSection = document.getElementById('resultsSection');
const resultsContainer = document.getElementById('resultsContainer');
const fontCount = document.getElementById('fontCount');
const loadingSection = document.getElementById('loadingSection');
const emptySection = document.getElementById('emptySection');
const settingsBtn = document.getElementById('settingsBtn');

// State
let currentFonts = [];
let currentUrl = '';
let scanOptions = { scanRoot: false };

// Initialize
async function init() {
  console.log('FontSource: Popup initialized');
  
  // Load state
  await loadState();
  
  // Set up event listeners
  setupEventListeners();
  
  // Load recent URLs
  loadRecentUrls();
  
  // Check if we have a current URL
  const tabUrl = await getCurrentTabUrl();
  if (tabUrl) {
    currentUrl = tabUrl;
    // Auto-scan if we have a URL
    scanCurrentPage();
  }
}

// Load state from background
async function loadState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (response && response.state) {
        scanOptions = response.state.scanOptions || { scanRoot: false };
      }
      resolve();
    });
  });
}

// Setup event listeners
function setupEventListeners() {
  scanBtn.addEventListener('click', () => scanUrl());
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') scanUrl();
  });
  settingsBtn.addEventListener('click', openSettings);
}

// Load recent URLs
function loadRecentUrls() {
  chrome.runtime.sendMessage({ action: 'getRecentUrls' }, (response) => {
    if (response && response.urls) {
      recentUrls.innerHTML = response.urls.map(url => `
        <span class="recent-url" data-url="${escapeHtml(url)}">
          <svg viewBox="0 0 24 24">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
          ${truncateUrl(url, 30)}
        </span>
      `).join('');
      
      // Add click handlers
      document.querySelectorAll('.recent-url').forEach(el => {
        el.addEventListener('click', () => {
          const url = el.dataset.url;
          urlInput.value = url;
          scanUrl(url);
        });
      });
    }
  });
}

// Get current tab URL
function getCurrentTabUrl() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getCurrentUrl' }, (response) => {
      resolve(response ? response.url : null);
    });
  });
}

// Scan current page
async function scanCurrentPage() {
  showLoading();
  
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'scanPage',
        options: scanOptions
      }, resolve);
    });
    
    if (response && response.fonts) {
      currentFonts = response.fonts;
      currentUrl = response.url || currentUrl;
      displayFonts(currentFonts);
    } else if (response && response.error) {
      showEmptyState(response.error);
    }
  } catch (e) {
    console.error('Scan error:', e);
    showEmptyState('Failed to scan page. Make sure you have an active tab.');
  }
}

// Scan URL
async function scanUrl(url) {
  const scanUrl = url || urlInput.value.trim();
  
  if (!scanUrl) {
    showEmptyState('Please enter a URL to scan');
    return;
  }
  
  // Validate URL
  let formattedUrl = scanUrl;
  if (!formattedUrl.startsWith('http')) {
    formattedUrl = 'https://' + formattedUrl;
  }
  
  showLoading();
  
  try {
    // Get page origin
    const originResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'getPageOrigin',
        url: formattedUrl
      }, resolve);
    });
    
    const origin = originResponse.origin;
    
    // Get fonts from content script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'scanPage',
        options: { ...scanOptions, url: origin }
      }, resolve);
    });
    
    if (response && response.fonts) {
      currentFonts = response.fonts;
      currentUrl = formattedUrl;
      displayFonts(currentFonts);
    } else {
      showEmptyState('No fonts found on this page');
    }
  } catch (e) {
    console.error('Scan error:', e);
    showEmptyState('Failed to scan page. Make sure you have an active tab.');
  }
}

// Display fonts
function displayFonts(fonts) {
  if (!fonts || fonts.length === 0) {
    showEmptyState('No fonts found on this page');
    return;
  }
  
  fontCount.textContent = `${fonts.length} font${fonts.length !== 1 ? 's' : ''}`;
  
  resultsContainer.innerHTML = fonts.map(font => createFontCard(font)).join('');
  
  resultsSection.style.display = 'block';
  emptySection.style.display = 'none';
  loadingSection.style.display = 'none';
}

// Create font card HTML
function createFontCard(font) {
  const sources = font.sourceInfo || [];
  const source = sources[0] || { service: 'Custom / Self-hosted', license: 'Varies by font' };
  
  // Determine source type for styling
  let sourceType = 'custom';
  if (source.service.toLowerCase().includes('google')) {
    sourceType = 'google-fonts';
  } else if (source.service.toLowerCase().includes('adobe')) {
    sourceType = 'adobe-typekit';
  } else if (source.service.toLowerCase().includes('fonts.com')) {
    sourceType = 'fonts-com';
  }
  
  // Get usage info
  const usageCount = font.usedInElements ? font.usedInElements.length : 0;
  const usageExamples = (font.usedInElements || []).slice(0, 5).map(el => escapeHtml(el.selector)).join(', ');
  
  // License link
  const licenseLink = source.licenseUrl 
    ? `<a href="${source.licenseUrl}" target="_blank" class="license-link">View License</a>`
    : '';
  
  return `
    <div class="font-card">
      <div class="font-card-header">
        <div class="font-name">${escapeHtml(font.fontFamily)}</div>
        <span class="font-source ${sourceType}">${escapeHtml(source.service)}</span>
      </div>
      
      <div class="font-details">
        <div class="detail-item">
          <span class="detail-label">Size</span>
          <span class="detail-value">${font.usedInElements && font.usedInElements[0] ? font.usedInElements[0].fontSize : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Weight</span>
          <span class="detail-value">${font.usedInElements && font.usedInElements[0] ? font.usedInElements[0].fontWeight : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Style</span>
          <span class="detail-value">${font.usedInElements && font.usedInElements[0] ? font.usedInElements[0].fontStyle : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Source</span>
          <span class="detail-value">${source.url ? escapeHtml(source.url) : 'Embedded'}</span>
        </div>
      </div>
      
      <div class="font-usage">
        <span class="usage-label">Used In (${usageCount} elements)</span>
        <div class="usage-list">
          ${usageExamples ? usageExamples.split(', ').map(el => `<span class="usage-item">${el}</span>`).join('') : '<span class="usage-item">N/A</span>'}
        </div>
      </div>
      
      <div class="font-license">
        <span class="license-label">License</span>
        <div class="license-text">${escapeHtml(source.license)} ${licenseLink ? `| ${licenseLink}` : ''}</div>
      </div>
    </div>
  `;
}

// Show loading state
function showLoading() {
  resultsSection.style.display = 'none';
  emptySection.style.display = 'none';
  loadingSection.style.display = 'flex';
}

// Show empty state
function showEmptyState(message) {
  resultsSection.style.display = 'none';
  loadingSection.style.display = 'none';
  emptySection.style.display = 'flex';
  emptySection.querySelector('p').textContent = message;
}

// Open settings
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Truncate URL
function truncateUrl(url, maxLength) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);