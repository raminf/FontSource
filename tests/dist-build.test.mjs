import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('make build-chrome', () => {
  it('copies extension into artifacts/chrome/ with a valid Chrome MV3 manifest', () => {
    execSync('make build-chrome', { cwd: root, stdio: 'pipe' });
    const extRoot = path.join(root, 'artifacts', 'chrome');
    const manifestPath = path.join(extRoot, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(m.manifest_version).toBe(3);
    expect(fs.existsSync(path.join(extRoot, 'background.js'))).toBe(true);
    expect(fs.existsSync(path.join(extRoot, 'content.js'))).toBe(true);
    expect(fs.existsSync(path.join(extRoot, 'popup', 'popup.html'))).toBe(true);
    expect(fs.existsSync(path.join(extRoot, 'icons', 'icon48.png'))).toBe(true);
  });
});
