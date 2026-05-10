import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureDataDir, DATA_DIR, APP_DIR } from '../../src/engine/constants.js';

describe('constants', () => {
  it('APP_DIR points to ~/.code-writer', () => {
    expect(APP_DIR).toBe(path.join(os.homedir(), '.code-writer'));
  });

  it('DATA_DIR points to ~/.code-writer/data', () => {
    expect(DATA_DIR).toBe(path.join(APP_DIR, 'data'));
  });
});

describe('ensureDataDir', () => {
  const bundled = path.resolve(__dirname, '../../data');
  let tmpDest: string;

  afterEach(() => {
    if (tmpDest) fs.rmSync(tmpDest, { recursive: true, force: true });
  });

  it('copies bundled seed data to target on first run', () => {
    tmpDest = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-data-test-'));

    const result = ensureDataDir(bundled, tmpDest);

    expect(result).toBe(tmpDest);
    expect(fs.existsSync(path.join(result, 'index.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(result, 'typescript'))).toBe(true);
    expect(fs.existsSync(path.join(result, 'python'))).toBe(true);
    expect(fs.existsSync(path.join(result, 'zig'))).toBe(true);
  });

  it('does not overwrite existing files (idempotent)', () => {
    tmpDest = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-data-test-'));

    // Create a marker file that shouldn't be overwritten
    const tsDir = path.join(tmpDest, 'typescript');
    fs.mkdirSync(tsDir, { recursive: true });
    const markerPath = path.join(tsDir, 'language.yaml');
    fs.writeFileSync(markerPath, 'MARKER_CONTENT');

    ensureDataDir(bundled, tmpDest);

    expect(fs.readFileSync(markerPath, 'utf-8')).toBe('MARKER_CONTENT');
  });

  it('returns dest dir when bundled source does not exist', () => {
    tmpDest = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-data-test-'));

    const result = ensureDataDir('/nonexistent/path', tmpDest);

    expect(result).toBe(tmpDest);
    // Directory exists but is empty (no files copied)
    expect(fs.readdirSync(tmpDest)).toHaveLength(0);
  });
});
