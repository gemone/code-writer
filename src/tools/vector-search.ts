import type { VectorStore } from '../engine/vector-store.js';
import type { EmbeddingProvider } from '../engine/embedding.js';
import { DEFAULT_SIMILARITY } from '../engine/vector-store.js';

export interface VectorDocument {
  language: string;
  source: string;
  module: string;
  name: string;
  signature: string;
  description: string;
  code: string;
  tags: string[];
}

export interface DepVectorDocument extends VectorDocument {
  library: string;
  version: string;
}

export type SearchHit = { document: VectorDocument; score: number };
export type DepSearchHit = { document: DepVectorDocument; score: number };

export async function tryVectorSearch(
  vectorStore: VectorStore | null,
  embedding: EmbeddingProvider | null,
  query: string,
  options: {
    language?: string;
    source?: string;
    limit?: number;
    similarity?: number;
  },
  renderHits: (hits: SearchHit[]) => string | null,
): Promise<string | null> {
  if (!vectorStore || !embedding) return null;
  try {
    const queryVector = await embedding.embed(query);
    return searchWithVector(vectorStore, query, queryVector, options, renderHits);
  } catch (error) {
    console.error('[code-writer] Vector search failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function searchWithVector(
  vectorStore: VectorStore,
  query: string,
  queryVector: number[],
  options: {
    language?: string;
    source?: string;
    limit?: number;
    similarity?: number;
  },
  renderHits: (hits: SearchHit[]) => string | null,
): Promise<string | null> {
  try {
    const results = await vectorStore.hybridSearch(query, queryVector, {
      language: options.language,
      source: options.source,
      limit: options.limit ?? 10,
      similarity: options.similarity ?? DEFAULT_SIMILARITY,
    });
    if (results.hits.length === 0) return null;
    return renderHits(results.hits.map(h => ({
      document: h.document as VectorDocument,
      score: h.score,
    })));
  } catch (error) {
    console.error('[code-writer] Vector search failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function tryDepVectorSearch(
  vectorStore: VectorStore | null,
  embedding: EmbeddingProvider | null,
  depKey: string,
  query: string,
  options: {
    language?: string;
    library?: string;
    limit?: number;
    similarity?: number;
  },
): Promise<DepSearchHit[]> {
  if (!vectorStore || !embedding) return [];
  try {
    const queryVector = await embedding.embed(query).catch(() => null);
    if (!queryVector) return [];
    return depSearchWithVector(vectorStore, depKey, query, queryVector, options);
  } catch {
    return [];
  }
}

export async function depSearchWithVector(
  vectorStore: VectorStore,
  depKey: string,
  query: string,
  queryVector: number[],
  options: {
    language?: string;
    library?: string;
    limit?: number;
    similarity?: number;
  },
): Promise<DepSearchHit[]> {
  try {
    const results = await vectorStore.depHybridSearch(depKey, query, queryVector, {
      language: options.language,
      library: options.library,
      limit: options.limit ?? 10,
      similarity: options.similarity ?? 0.6,
    });
    return results.hits.map(h => ({
      document: h.document as DepVectorDocument,
      score: h.score,
    }));
  } catch {
    return [];
  }
}
