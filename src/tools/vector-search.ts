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

export type SearchHit = { document: VectorDocument; score: number };

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
