/**
 * Settings Script
 * Handles settings panel interactions and state management
 */

const FIND_SEARCH_PRESETS = {
  google: 'https://www.google.com/search?q={query}',
  duckduckgo: 'https://duckduckgo.com/?q={query}',
  bing: 'https://www.bing.com/search?q={query}',
  ecosia: 'https://www.ecosia.org/search?q={query}',
  perplexity: 'https://www.perplexity.ai/search?q={query}',
  kagi: 'https://kagi.com/search?q={query}'
};

const closeBtn = document.getElementById('closeBtn');
const saveBtn = document.getElementById('saveBtn');
const scanScopeRadios = document.querySelectorAll('input[name="scanScope"]');
const showPreviewCheckbox = document.getElementById('showPreview');
const groupBySourceCheckbox = document.getElementById('groupBySource');
const findSearchPreset = document.getElementById('findSearchPreset');
const findSearchTemplate = document.getElementById('findSearchTemplate');

let settings = {
  scanRoot: false,
  showPreview: true,
  groupBySource: false,
  findSearchUrlTemplate: FIND_SEARCH_PRESETS.google
};

function detectPresetKey(template) {
  const t = String(template || '').trim();
  for (const [key, url] of Object.entries(FIND_SEARCH_PRESETS)) {
    if (url === t) {
      return key;
    }
  }
  return 'custom';
}

function init() {
  console.log('FontSource: Settings initialized');
  loadSettings();
  setupEventListeners();
}

function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response && response.state) {
      const st = response.state;
      const scanRoot = st.scanOptions?.scanRoot || false;
      const radio = document.querySelector(`input[name="scanScope"][value="${scanRoot ? 'root' : 'current'}"]`);
      if (radio) {
        radio.checked = true;
      }
      settings.scanRoot = scanRoot;

      showPreviewCheckbox.checked = st.showPreview !== false;
      groupBySourceCheckbox.checked = !!st.groupBySource;

      const template =
        typeof st.findSearchUrlTemplate === 'string' && st.findSearchUrlTemplate.includes('{query}')
          ? st.findSearchUrlTemplate
          : FIND_SEARCH_PRESETS.google;
      settings.findSearchUrlTemplate = template;
      findSearchTemplate.value = template;
      findSearchPreset.value = detectPresetKey(template);
    }
  });
}

function setupEventListeners() {
  closeBtn.addEventListener('click', closeSettings);
  saveBtn.addEventListener('click', saveSettings);

  scanScopeRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      settings.scanRoot = e.target.value === 'root';
    });
  });

  showPreviewCheckbox.addEventListener('change', (e) => {
    settings.showPreview = e.target.checked;
  });

  groupBySourceCheckbox.addEventListener('change', (e) => {
    settings.groupBySource = e.target.checked;
  });

  findSearchPreset.addEventListener('change', () => {
    const v = findSearchPreset.value;
    if (v !== 'custom' && FIND_SEARCH_PRESETS[v]) {
      findSearchTemplate.value = FIND_SEARCH_PRESETS[v];
    }
  });

  findSearchTemplate.addEventListener('input', () => {
    findSearchPreset.value = detectPresetKey(findSearchTemplate.value);
  });
}

function saveSettings() {
  const scanRoot = document.querySelector('input[name="scanScope"]:checked').value === 'root';
  const template = findSearchTemplate.value.trim();

  chrome.runtime.sendMessage(
    {
      action: 'updateState',
      scanOptions: { scanRoot },
      showPreview: showPreviewCheckbox.checked,
      groupBySource: groupBySourceCheckbox.checked,
      findSearchUrlTemplate: template
    },
    (response) => {
      if (chrome.runtime.lastError) {
        showNotification('Could not save settings.');
        return;
      }
      if (response && response.success) {
        showNotification('Settings saved successfully!');
        setTimeout(() => {
          closeSettings();
        }, 1500);
      } else {
        showNotification('Could not save settings.');
      }
    }
  );
}

function closeSettings() {
  window.close();
}

function showNotification(message) {
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

  setTimeout(() => {
    notification.style.animation = 'slideUp 0.3s ease reverse';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 2000);
}

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

document.addEventListener('DOMContentLoaded', init);
