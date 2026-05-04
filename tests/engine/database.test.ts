import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../src/engine/database.js';

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-writer-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = new DatabaseManager(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create database file', () => {
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('should insert and retrieve a language', () => {
    db.insertLanguage('typescript', 'TypeScript', '5.7', ['.ts', '.tsx'], ['ts']);
    const langs = db.getAllLanguages();
    expect(langs).toHaveLength(1);
    expect(langs[0].id).toBe('typescript');
    expect(langs[0].name).toBe('TypeScript');
  });

  it('should insert and search stdlib entries', () => {
    db.insertLanguage('typescript', 'TypeScript', '5.7', ['.ts'], ['ts']);
    db.insertStdlibEntry('typescript', 'Array', 'map', 'map<U>(fn: (v: T) => U): U[]', 'Transform each element', 'arr.map(x => x * 2)', ['transform']);

    const methods = db.getStdlibMethods('typescript', 'Array');
    expect(methods).toHaveLength(1);
    expect(methods[0].method).toBe('map');
    expect(methods[0].signature).toBe('map<U>(fn: (v: T) => U): U[]');
  });

  it('should insert and retrieve conventions', () => {
    db.insertLanguage('typescript', 'TypeScript', '5.7', ['.ts'], ['ts']);
    db.insertConvention('typescript', 'no-var', 'Use const/let instead of var', 'error', 'const x = 1', 'var x = 1', 'Block scoping');

    const convs = db.getConventions('typescript');
    expect(convs).toHaveLength(1);
    expect(convs[0].name).toBe('no-var');
    expect(convs[0].severity).toBe('error');
  });

  it('should insert and retrieve patterns', () => {
    db.insertLanguage('typescript', 'TypeScript', '5.7', ['.ts'], ['ts']);
    db.insertPattern('typescript', 'Singleton', 'Ensure single instance', 'creational', 'When exactly one instance needed', 'class S { static instance; }', ['Factory']);

    const patterns = db.getPatterns('typescript');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('Singleton');
  });

  it('should search across tables', () => {
    db.insertLanguage('typescript', 'TypeScript', '5.7', ['.ts'], ['ts']);
    db.insertStdlibEntry('typescript', 'Array', 'filter', 'filter(fn): T[]', 'Filter elements', 'arr.filter(x => x > 0)', ['filter']);
    db.insertConvention('typescript', 'no-any', 'Avoid using any type', 'error', 'const x: string = "hi"', 'const x: any = "hi"', 'Type safety');

    const results = db.searchAll('filter');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should manage project memory', () => {
    db.setProjectMemory('/test/project', 'typescript', 10);
    db.setProjectMemory('/test/project', 'python', 5);

    const memory = db.getProjectMemory('/test/project');
    expect(memory).toHaveLength(2);
    expect(memory.find(m => m.language === 'typescript')?.fileCount).toBe(10);
  });

  it('should clear language data', () => {
    db.insertLanguage('typescript', 'TypeScript', '5.7', ['.ts'], ['ts']);
    db.insertStdlibEntry('typescript', 'Array', 'map', 'map()', 'Map', 'x', []);
    db.clearLanguageData('typescript');

    const methods = db.getStdlibMethods('typescript', 'Array');
    expect(methods).toHaveLength(0);
  });
});
