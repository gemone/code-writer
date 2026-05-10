import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../src/engine/database.js';
import { DepQueryEngine } from '../../src/engine/dep-query.js';
import { createDepSearchTool } from '../../src/tools/dep-search.js';

describe('dep_search tool', () => {
  let db: DatabaseManager;
  let tmpDir: string;
  let tool: ReturnType<typeof createDepSearchTool>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-writer-dep-search-'));
    db = new DatabaseManager(tmpDir);
    const queryEngine = new DepQueryEngine(db);
    tool = createDepSearchTool(queryEngine, null, null);

    // Seed data
    db.insertDepRegistry({
      id: 'express@4', libraryName: 'express', resolvedVersion: '4.18.2',
      language: 'typescript', description: 'Web framework',
    });
    db.insertDepApi({
      depId: 'express@4', module: 'Router', exportName: 'get',
      description: 'Handle HTTP GET request', signature: 'get(path: string, handler: Handler)',
    });
    db.insertDepApi({
      depId: 'express@4', module: 'Router', exportName: 'post',
      description: 'Handle HTTP POST request', signature: 'post(path: string, handler: Handler)',
    });
    db.insertDepConsideration({
      depId: 'express@4', title: 'Use Helmet', category: 'security',
      description: 'Security middleware consideration', severity: 'warning',
    });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find APIs by keyword', async () => {
    const result = await tool.handler({ query: 'GET request' });
    expect(result.content[0].text).toContain('GET');
  });

  it('should find considerations', async () => {
    const result = await tool.handler({ query: 'security', category: 'considerations' });
    expect(result.content[0].text).toContain('Helmet');
  });

  it('should return no results message for unmatched query', async () => {
    const result = await tool.handler({ query: 'xyznonexistent' });
    expect(result.content[0].text).toContain('No dependency results');
  });

  it('should filter by language', async () => {
    // Add a Python dep with similar name
    db.insertDepRegistry({
      id: 'express@py', libraryName: 'express', resolvedVersion: '0.3',
      language: 'python',
    });
    db.insertDepApi({
      depId: 'express@py', module: 'app', exportName: 'get',
      description: 'GET route handler',
    });

    const result = await tool.handler({ query: 'GET', language: 'typescript' });
    const text = result.content[0].text as string;
    // Should only have typescript results
    expect(text).toContain('express');
    // The python one shouldn't appear
    const matches = text.match(/express@py/g);
    expect(matches).toBeNull();
  });

  it('should filter by category', async () => {
    const result = await tool.handler({ query: 'request', category: 'apis' });
    expect(result.content[0].text).toContain('apis');
  });

  it('should resolve library name aliases', async () => {
    const result = await tool.handler({ query: 'request', libraryName: 'express' });
    expect(result.content[0].text).toContain('express');
  });
});
