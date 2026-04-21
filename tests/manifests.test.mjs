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
  it('Chrome MV3 manifest has required fields', () => {
    const m = readJson('manifest.json');
    expect(m.manifest_version).toBe(3);
    expect(m.name).toBeTruthy();
    expect(m.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(m.background?.service_worker).toBe('background.js');
  });

  it('Firefox manifest is MV2 with required fields', () => {
    const m = readJson('manifest.firefox.json');
    expect(m.manifest_version).toBe(2);
    expect(m.name).toBeTruthy();
    expect(m.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(m.background?.scripts).toBeTruthy();
  });

  it('Safari manifest is MV3 with required fields', () => {
    const m = readJson('manifest.safari.json');
    expect(m.manifest_version).toBe(3);
    expect(m.name).toBeTruthy();
    expect(m.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
