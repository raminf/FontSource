(function reportExportPage() {
  'use strict';

  const reportUrl = document.getElementById('reportUrl');
  const reportDate = document.getElementById('reportDate');
  const reportCount = document.getElementById('reportCount');
  const reportGrid = document.getElementById('reportGrid');
  const reportEmpty = document.getElementById('reportEmpty');

  function extensionStorage() {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return { local: browser.storage.local, isBrowser: true };
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return { local: chrome.storage.local, isBrowser: false };
    }
    return null;
  }

  function getStoredExportPayload() {
    const storage = extensionStorage();
    if (!storage) {
      return Promise.resolve(null);
    }
    if (storage.isBrowser) {
      return storage.local.get('reportExportPayload').then((result) => result.reportExportPayload || null);
    }
    return new Promise((resolve) => {
      storage.local.get(['reportExportPayload'], (result) => {
        resolve((result && result.reportExportPayload) || null);
      });
    });
  }

  function escapeText(text) {
    return String(text || '');
  }

  function formatDate(iso) {
    if (!iso) {
      return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString();
  }

  function sourceTypeClass(service) {
    const value = String(service || '').toLowerCase();
    if (value.includes('google')) {
      return 'google-fonts';
    }
    if (value.includes('adobe')) {
      return 'adobe-typekit';
    }
    if (value.includes('fonts.com')) {
      return 'fonts-com';
    }
    return 'custom';
  }

  function textEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    el.textContent = escapeText(text);
    return el;
  }

  function buildFontCard(font) {
    const source = (font.sourceInfo && font.sourceInfo[0]) || {
      service: 'Custom / Self-hosted',
      license: 'Varies by font',
      url: ''
    };
    const firstUse = (font.usedInElements && font.usedInElements[0]) || null;

    const card = document.createElement('article');
    card.className = 'font-card';

    const header = document.createElement('div');
    header.className = 'font-card-header';
    header.appendChild(textEl('div', 'font-name', font.fontFamily || 'Unknown font'));
    header.appendChild(textEl('span', `font-source ${sourceTypeClass(source.service)}`, source.service || 'Unknown'));
    card.appendChild(header);

    const details = document.createElement('div');
    details.className = 'font-details';

    const makeDetail = (label, value, fullWidth) => {
      const item = document.createElement('div');
      item.className = fullWidth ? 'detail-item detail-item--full' : 'detail-item';
      item.appendChild(textEl('span', 'detail-label', label));
      item.appendChild(textEl('div', 'detail-value', value));
      return item;
    };

    details.appendChild(makeDetail('Size', firstUse ? firstUse.fontSize : 'N/A'));
    details.appendChild(makeDetail('Weight', firstUse ? firstUse.fontWeight : 'N/A'));
    details.appendChild(makeDetail('Style', firstUse ? firstUse.fontStyle : 'N/A'));
    details.appendChild(makeDetail('Source', source.url || 'No file URL', true));
    card.appendChild(details);

    const usage = document.createElement('div');
    usage.className = 'font-usage';
    const usageCount =
      typeof font.usageElementCount === 'number'
        ? font.usageElementCount
        : Array.isArray(font.usedInElements)
          ? font.usedInElements.length
          : 0;
    usage.appendChild(textEl('span', 'usage-label', `Used in (${usageCount} elements)`));
    const usageList = document.createElement('div');
    usageList.className = 'usage-list';
    const selectors =
      Array.isArray(font.usedInElements) && font.usedInElements.length
        ? font.usedInElements.slice(0, 8).map((item) => item.selector || 'N/A')
        : ['N/A'];
    for (const selector of selectors) {
      usageList.appendChild(textEl('span', 'usage-item', selector));
    }
    usage.appendChild(usageList);
    card.appendChild(usage);

    const license = document.createElement('div');
    license.className = 'font-license';
    license.appendChild(textEl('span', 'license-label', 'License'));
    license.appendChild(textEl('div', 'license-text', source.license || 'Unknown license'));
    card.appendChild(license);

    return card;
  }

  async function init() {
    const payload = await getStoredExportPayload();
    if (!payload || !Array.isArray(payload.fonts) || payload.fonts.length === 0) {
      reportEmpty.hidden = false;
      reportGrid.hidden = true;
      return;
    }

    reportUrl.textContent = payload.currentUrl || '';
    reportDate.textContent = formatDate(payload.generatedAt);
    reportCount.textContent = `${payload.fonts.length} font${payload.fonts.length !== 1 ? 's' : ''}`;

    const cards = payload.fonts.map((font) => buildFontCard(font));
    reportGrid.replaceChildren(...cards);

    const params = new URLSearchParams(window.location.search);
    if (params.get('print') === '1') {
      window.setTimeout(() => {
        window.print();
      }, 350);
    }
  }

  void init();
})();
