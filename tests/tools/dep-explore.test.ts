import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../src/engine/database.js';
import { DepQueryEngine } from '../../src/engine/dep-query.js';
import { createDepExploreTool } from '../../src/tools/dep-explore.js';

describe('dep_explore tool', () => {
  let db: DatabaseManager;
  let tmpDir: string;
  let tool: ReturnType<typeof createDepExploreTool>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-writer-dep-explore-'));
    db = new DatabaseManager(tmpDir);
    const queryEngine = new DepQueryEngine(db);
    tool = createDepExploreTool(db, queryEngine);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should redirect stdlib modules to lang_ref', async () => {
    const result = await tool.handler({ libraryName: 'fs', language: 'typescript' });
    expect(result.content[0].text).toContain('standard library');
    expect(result.content[0].text).toContain('lang_ref');
  });

  it('should return fetch instructions when not cached', async () => {
    const result = await tool.handler({ libraryName: 'express', language: 'typescript', version: '^4.0.0' });
    expect(result.content[0].text).toContain('No cached data');
    expect(result.content[0].text).toContain('dep_fetch');
  });

  it('should render cached APIs', async () => {
    db.insertDepRegistry({
      id: 'express@^4.0.0', libraryName: 'express', resolvedVersion: '4.18.2',
      versionRange: '^4.0.0', language: 'typescript', description: 'Web framework',
    });
    db.insertDepApi({
      depId: 'express@^4.0.0', module: 'Router', exportName: 'get',
      description: 'Handle GET request', signature: 'get(path: string, handler: Handler)',
    });
    db.insertDepVersionCache({
      libraryName: 'express', language: 'typescript',
      versionRange: '^4.0.0', resolvedVersion: '4.18.2', depId: 'express@^4.0.0',
    });

    const result = await tool.handler({ libraryName: 'express', language: 'typescript', version: '^4.0.0' });
    expect(result.content[0].text).toContain('express');
    expect(result.content[0].text).toContain('API Surface');
    expect(result.content[0].text).toContain('Router');
    expect(result.content[0].text).toContain('`get`');
  });

  it('should render cached patterns', async () => {
    db.insertDepRegistry({
      id: 'react@18', libraryName: 'react', resolvedVersion: '18.2.0',
      versionRange: '^18.0.0', language: 'typescript',
    });
    db.insertDepPattern({
      depId: 'react@18', name: 'custom-hook', category: 'advanced',
      description: 'Extract logic into custom hooks', codeExample: 'function useMyHook() { ... }',
    });
    db.insertDepVersionCache({
      libraryName: 'react', language: 'typescript',
      versionRange: '^18.0.0', resolvedVersion: '18.2.0', depId: 'react@18',
    });

    const result = await tool.handler({ libraryName: 'react', language: 'typescript', version: '^18.0.0', section: 'patterns' });
    expect(result.content[0].text).toContain('Patterns');
    expect(result.content[0].text).toContain('custom-hook');
  });

  it('should render cached considerations', async () => {
    db.insertDepRegistry({
      id: 'next@14', libraryName: 'next.js', resolvedVersion: '14.0.0',
      versionRange: '^14.0.0', language: 'typescript',
    });
    db.insertDepConsideration({
      depId: 'next@14', title: 'Image Optimization', category: 'performance',
      description: 'Use next/image for automatic optimization',
      severity: 'warning', fixSuggestion: 'Replace <img> with <Image>',
    });
    db.insertDepVersionCache({
      libraryName: 'next.js', language: 'typescript',
      versionRange: '^14.0.0', resolvedVersion: '14.0.0', depId: 'next@14',
    });

    const result = await tool.handler({ libraryName: 'next.js', language: 'typescript', version: '^14.0.0', section: 'considerations' });
    expect(result.content[0].text).toContain('Considerations');
    expect(result.content[0].text).toContain('WARNING');
    expect(result.content[0].text).toContain('Image Optimization');
    expect(result.content[0].text).toContain('Replace <img>');
  });
});
