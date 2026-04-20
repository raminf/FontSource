/**
 * Settings Script
 * Handles settings panel interactions and state management
 */

// DOM Elements
const closeBtn = document.getElementById('closeBtn');
const saveBtn = document.getElementById('saveBtn');
const scanScopeRadios = document.querySelectorAll('input[name="scanScope"]');
const showPreviewCheckbox = document.getElementById('showPreview');
const groupBySourceCheckbox = document.getElementById('groupBySource');

// State
let settings = {
  scanRoot: false,
  showPreview: true,
  groupBySource: false
};

// Initialize
function init() {
  console.log('FontSource: Settings initialized');
  
  // Load settings
  loadSettings();
  
  // Set up event listeners
  setupEventListeners();
}

// Load settings from background
function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response && response.state) {
      const state = response.state;
      
      // Set scan scope
      const scanRoot = state.scanOptions?.scanRoot || false;
      document.querySelector(`input[value="${scanRoot ? 'root' : 'current'}"]`).checked = true;
      
      // Set other settings
      showPreviewCheckbox.checked = state.showPreview !== false;
      groupBySourceCheckbox.checked = state.groupBySource || false;
    }
  });
}

// Setup event listeners
function setupEventListeners() {
  closeBtn.addEventListener('click', closeSettings);
  saveBtn.addEventListener('click', saveSettings);
  
  // Scan scope radio buttons
  scanScopeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      settings.scanRoot = e.target.value === 'root';
    });
  });
  
  // Checkboxes
  showPreviewCheckbox.addEventListener('change', (e) => {
    settings.showPreview = e.target.checked;
  });
  
  groupBySourceCheckbox.addEventListener('change', (e) => {
    settings.groupBySource = e.target.checked;
  });
}

// Save settings
function saveSettings() {
  const scanRoot = document.querySelector('input[name="scanScope"]:checked').value === 'root';
  
  const newSettings = {
    scanOptions: {
      scanRoot: scanRoot
    },
    showPreview: showPreviewCheckbox.checked,
    groupBySource: groupBySourceCheckbox.checked
  };
  
  chrome.runtime.sendMessage({
    action: 'updateState',
    scanOptions: newSettings.scanOptions
  }, (response) => {
    if (response && response.success) {
      // Show saved notification
      showNotification('Settings saved successfully!');
      
      // Close after a delay
      setTimeout(() => {
        closeSettings();
      }, 1500);
    }
  });
}

// Close settings
function closeSettings() {
  window.close();
}

// Show notification
function showNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #10b981;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    animation: slideUp 0.3s ease;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remove after delay
  setTimeout(() => {
    notification.style.animation = 'slideUp 0.3s ease reverse';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 2000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translate(-50%, 20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
`;
document.head.appendChild(style);

// Initialize on load
document.addEventListener('DOMContentLoaded', init);