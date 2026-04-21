import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');

function readJson(rel) {
  const p = path.join(src, rel);
  expect(fs.existsSync(p), `missing ${rel}`).toBe(true);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('Source manifests', () => {
  const webMatches = ['http://*/*', 'https://*/*'];

  it('Chrome MV3 manifest has required fields', () => {
    const m = readJson('manifest.json');
    expect(m.manifest_version).toBe(3);
    expect(m.name).toBeTruthy();
    expect(m.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(m.background?.service_worker).toBe('background.js');
    expect(m.host_permissions).toEqual(webMatches);
  });

  it('Firefox manifest is MV2 with required fields', () => {
    const m = readJson('manifest.firefox.json');
    expect(m.manifest_version).toBe(2);
    expect(m.name).toBeTruthy();
    expect(m.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Array.isArray(m.background?.scripts)).toBe(true);
    expect(m.background.scripts[0]).toBe('lib/font-face-remote.js');
    expect(m.background.scripts).toContain('background.js');
    expect(m.background?.service_worker).toBeUndefined();
    expect(m.browser_specific_settings?.gecko?.id).toMatch(/@/);
    const perms = Array.isArray(m.permissions) ? m.permissions : [];
    expect(perms.includes('windows')).toBe(false);
    expect(perms.includes('tabs')).toBe(false);
    /* MV2 build uses tabs.executeScript, not chrome.scripting — avoid extra permission surface. */
    expect(perms.includes('scripting')).toBe(false);
    expect(perms.filter((p) => p.startsWith('http'))).toEqual(webMatches);
  });

  it('Safari manifest is MV3 with required fields', () => {
    const m = readJson('manifest.safari.json');
    expect(m.manifest_version).toBe(3);
    expect(m.name).toBeTruthy();
    expect(m.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(m.host_permissions).toEqual(webMatches);
  });
});
