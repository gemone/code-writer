import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../src/engine/database.js';
import { LanguageLoader } from '../../src/engine/loader.js';

describe('LanguageLoader', () => {
  let db: DatabaseManager;
  let loader: LanguageLoader;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    db = new DatabaseManager(dbPath);
    const dataDir = path.resolve(__dirname, '../../data');
    loader = new LanguageLoader(db, dataDir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should sync YAML data to database', async () => {
    await loader.syncFromYaml();
    const langs = db.getAllLanguages();
    expect(langs.length).toBeGreaterThan(0);
    expect(langs.some(l => l.id === 'typescript')).toBe(true);
    expect(langs.some(l => l.id === 'python')).toBe(true);
  });

  it('should load stdlib entries after sync', async () => {
    await loader.syncFromYaml();
    const methods = db.getStdlibMethods('typescript', 'Array');
    expect(methods.length).toBeGreaterThan(0);
  });

  it('should load conventions after sync', async () => {
    await loader.syncFromYaml();
    const convs = db.getConventions('typescript');
    expect(convs.length).toBeGreaterThan(0);
  });

  it('should load patterns after sync', async () => {
    await loader.syncFromYaml();
    const patterns = db.getPatterns('typescript');
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('should load language meta', () => {
    const meta = loader.loadLanguageMeta('typescript');
    expect(meta).not.toBeNull();
    const name = (meta as Record<string, unknown>)?.name;
    expect(name).toBe('TypeScript');
  });

  it('should return null for unknown language meta', () => {
    const meta = loader.loadLanguageMeta('nonexistent');
    expect(meta).toBeNull();
  });

  it('should skip re-sync when data unchanged', async () => {
    await loader.syncFromYaml();
    const langs1 = db.getAllLanguages();
    // Create a new loader with same DB - sync timestamps reset
    const loader2 = new LanguageLoader(db, loader.getDataDir());
    await loader2.syncFromYaml();
    const langs2 = db.getAllLanguages();
    // Same languages should be present
    expect(langs1.length).toBe(langs2.length);
  });

  it('should return data directory', () => {
    expect(loader.getDataDir()).toContain('data');
  });
});
