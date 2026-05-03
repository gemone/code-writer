import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../src/engine/database.js';
import { LanguageLoader } from '../../src/engine/loader.js';
import { QueryEngine } from '../../src/engine/query.js';

describe('QueryEngine', () => {
  let db: DatabaseManager;
  let query: QueryEngine;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'query-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    db = new DatabaseManager(dbPath);
    const dataDir = path.resolve(__dirname, '../../data');
    const loader = new LanguageLoader(db, dataDir);
    await loader.syncFromYaml();
    query = new QueryEngine(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getMethod', () => {
    it('should find a specific stdlib method', () => {
      const results = query.getMethod('typescript', 'Array', 'map');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].method).toBe('map');
      expect(results[0].signature).toBeDefined();
    });

    it('should return empty array for nonexistent method', () => {
      const results = query.getMethod('typescript', 'Array', 'nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should list all methods in a module when no method specified', () => {
      const results = query.getMethod('typescript', 'Array');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    it('should find entries matching a query', () => {
      const results = query.search('map');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by language', () => {
      const results = query.search('map', { language: 'typescript' });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.language).toBe('typescript');
      }
    });

    it('should filter by category', () => {
      const results = query.search('array', { category: 'stdlib' });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.source).toBe('stdlib');
      }
    });

    it('should return empty for no matches', () => {
      const results = query.search('xyznonexistent123');
      expect(results).toHaveLength(0);
    });
  });

  describe('getConventions', () => {
    it('should return conventions for a language', () => {
      const convs = query.getConventions('typescript');
      expect(convs.length).toBeGreaterThan(0);
      expect(convs[0]).toHaveProperty('name');
      expect(convs[0]).toHaveProperty('rule');
      expect(convs[0]).toHaveProperty('severity');
    });

    it('should filter by severity', () => {
      const convs = query.getConventions('typescript', { severity: 'error' });
      for (const c of convs) {
        expect(c.severity).toBe('error');
      }
    });

    it('should return all conventions when no language specified', () => {
      const convs = query.getConventions();
      expect(convs.length).toBeGreaterThan(0);
    });
  });

  describe('compare', () => {
    it('should compare a concept across languages', () => {
      const result = query.compare('array iteration', ['typescript', 'python']);
      expect(result).toHaveProperty('concept');
      expect(result).toHaveProperty('languages');
      expect(result.languages.length).toBe(2);
    });

    it('should return result with empty sections for unknown languages', () => {
      const result = query.compare('loops', ['nonexistent']);
      expect(result.concept).toBe('loops');
      expect(result.languages).toHaveLength(1);
      expect(result.languages[0].sections).toHaveLength(0);
    });
  });
});
