import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('make build', () => {
  it('copies extension into dist/ with a valid Chrome MV3 manifest', () => {
    execSync('make build', { cwd: root, stdio: 'pipe' });
    const manifestPath = path.join(root, 'dist', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(m.manifest_version).toBe(3);
    expect(fs.existsSync(path.join(root, 'dist', 'background.js'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'dist', 'content.js'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'dist', 'popup', 'popup.html'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'dist', 'icons', 'icon48.png'))).toBe(true);
  });
});
