import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../src/engine/database.js';
import { DepQueryEngine } from '../../src/engine/dep-query.js';
import { VectorStore } from '../../src/engine/vector-store.js';
import { createDepSearchTool } from '../../src/tools/dep-search.js';

function createMockEmbedding(dimension: number) {
  return {
    dimension,
    embed: async (_text: string) => new Array(dimension).fill(0.1),
    embedBatch: async (texts: string[]) => texts.map(() => new Array(dimension).fill(0.1)),
  };
}

describe('dep vector search integration', () => {
  let db: DatabaseManager;
  let tmpDir: string;
  let vectorStore: VectorStore;
  const dimension = 8;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-writer-dep-vector-'));
    db = new DatabaseManager(tmpDir);

    // Seed dependency data
    db.insertDepRegistry({
      id: 'express@4',
      libraryName: 'express',
      resolvedVersion: '4.18.2',
      language: 'typescript',
      description: 'Web framework',
    });
    db.insertDepApi({
      depId: 'express@4',
      module: 'Router',
      exportName: 'get',
      description: 'Handle HTTP GET request',
      signature: 'get(path: string, handler: Handler)',
    });
    db.insertDepApi({
      depId: 'express@4',
      module: 'Router',
      exportName: 'post',
      description: 'Handle HTTP POST request',
      signature: 'post(path: string, handler: Handler)',
    });
    db.insertDepConsideration({
      depId: 'express@4',
      title: 'Use Helmet',
      category: 'security',
      description: 'Security middleware consideration',
      severity: 'warning',
    });

    vectorStore = new VectorStore(dimension);
    await vectorStore.loadOrInitialize();
  });

  afterEach(async () => {
    await vectorStore.persist();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should index dependency documents into vector store', async () => {
    const embedding = createMockEmbedding(dimension);
    const { indexDependency } = await import('../../src/engine/dep-indexer.js');
    const result = await indexDependency('express@4', db, vectorStore, embedding);

    expect(result.indexed).toBe(3); // 2 APIs + 1 consideration
    expect(result.libraryName).toBe('express');
    expect(vectorStore.isDepIndexed('express@4')).toBe(true);
  });

  it('should return empty result for unknown dep', async () => {
    const embedding = createMockEmbedding(dimension);
    const { indexDependency } = await import('../../src/engine/dep-indexer.js');
    const result = await indexDependency('nonexistent@1', db, vectorStore, embedding);

    expect(result.indexed).toBe(0);
  });

  it('should search dep vector indexes via dep_search tool', async () => {
    const embedding = createMockEmbedding(dimension);
    const { indexDependency } = await import('../../src/engine/dep-indexer.js');
    await indexDependency('express@4', db, vectorStore, embedding);

    const depQueryEngine = new DepQueryEngine(db);
    const tool = createDepSearchTool(depQueryEngine, vectorStore, embedding);

    const result = await tool.handler({ query: 'GET request' });
    expect(result.content[0].text).toContain('GET');
  });

  it('should list indexed dep keys', async () => {
    const embedding = createMockEmbedding(dimension);
    const { indexDependency } = await import('../../src/engine/dep-indexer.js');
    await indexDependency('express@4', db, vectorStore, embedding);

    const keys = vectorStore.getIndexedDepKeys();
    expect(keys).toContain('express_4');
  });

  it('should persist and reload dep indexes', async () => {
    const embedding = createMockEmbedding(dimension);
    const { indexDependency } = await import('../../src/engine/dep-indexer.js');
    await indexDependency('express@4', db, vectorStore, embedding);
    await vectorStore.persist();

    // Create new VectorStore and verify it loads the dep index
    const reloaded = new VectorStore(dimension);
    await reloaded.loadOrInitialize();
    expect(reloaded.isDepIndexed('express@4')).toBe(true);
    expect(reloaded.getIndexedDepKeys()).toContain('express_4');
  });

  it('should mark dep as indexed in database after indexing', async () => {
    const embedding = createMockEmbedding(dimension);
    const { indexDependency } = await import('../../src/engine/dep-indexer.js');
    await indexDependency('express@4', db, vectorStore, embedding);

    const registry = db.getDepRegistry('express@4');
    expect(registry?.is_indexed).toBe(1);
  });
});
