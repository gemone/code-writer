import type { QueryEngine } from '../engine/query.js';
import type { VectorStore } from '../engine/vector-store.js';
import type { EmbeddingProvider } from '../engine/embedding.js';
import { tryVectorSearch, type SearchHit } from './vector-search.js';

function renderSqliteResults(results: { source: string; name: string; language: string; section: string; snippet: string }[]): string {
  let text = '';
  for (const r of results) {
    text += `## [${r.source}] ${r.name} (${r.language})\n`;
    text += `Section: ${r.section}\n\n`;
    text += `${r.snippet}\n\n---\n\n`;
  }
  return text;
}

function renderVectorHits(hits: SearchHit[]): string {
  let text = '';
  for (const { document: doc, score } of hits) {
    text += `## [${doc.source}] ${doc.name} (${doc.language})\n`;
    text += `Module: ${doc.module}\n\n`;
    if (doc.signature) text += `Signature: \`${doc.signature}\`\n\n`;
    text += `${doc.description}\n\n`;
    if (doc.code) text += `\`\`\`\n${doc.code}\n\`\`\`\n\n`;
    text += `Score: ${score.toFixed(3)}\n\n---\n\n`;
  }
  return text;
}

export function createLangSearchTool(
  queryEngine: QueryEngine,
  vectorStore: VectorStore | null,
  embedding: EmbeddingProvider | null,
) {
  return {
    name: 'lang_search' as const,
    description: 'Full-text search across all language data. Returns matching stdlib APIs, syntax examples, conventions, and patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (method name, concept, pattern name)' },
        language: { type: 'string', description: 'Restrict to a specific language' },
        category: { type: 'string', enum: ['stdlib', 'syntax', 'conventions', 'patterns', 'all'], default: 'all' },
        limit: { type: 'number', minimum: 1, maximum: 20, default: 5 },
      },
      required: ['query'],
    },
    handler: async (args: { query: string; language?: string; category?: string; limit?: number }) => {
      const lang = args.language?.toLowerCase();
      const category = args.category || 'all';
      const limit = args.limit || 5;

      const sqliteResults = queryEngine.search(args.query, {
        language: lang,
        category: category as 'stdlib' | 'syntax' | 'conventions' | 'patterns' | 'all',
        limit,
      });

      // If SQLite fills the limit, return immediately
      if (sqliteResults.length >= limit) {
        return { content: [{ type: 'text' as const, text: `# Search Results for "${args.query}"\n\n${renderSqliteResults(sqliteResults)}` }] };
      }

      // Collect Orama hits to fill remaining slots
      const seen = new Set(sqliteResults.map(r => `${r.source}:${r.name}`));
      let ormaHits: SearchHit[] = [];
      if (vectorStore && embedding) {
        try {
          const queryVector = await embedding.embed(args.query).catch(() => null);
          if (queryVector) {
            const results = await vectorStore.hybridSearch(args.query, queryVector, {
              language: lang,
              source: category === 'stdlib' ? 'stdlib' : undefined,
              limit: limit - sqliteResults.length,
              similarity: 0.6,
            });
            ormaHits = results.hits
              .map(h => ({ document: h.document as import('./vector-search.js').VectorDocument, score: h.score }))
              .filter(h => !seen.has(`${h.document.source}:${h.document.name}`));
          }
        } catch { /* vector search unavailable */ }
      }

      if (sqliteResults.length === 0 && ormaHits.length === 0) {
        return { content: [{ type: 'text' as const, text: `No results found for "${args.query}".` }] };
      }

      const text = `# Search Results for "${args.query}"\n\n${renderSqliteResults(sqliteResults)}${renderVectorHits(ormaHits)}`;
      return { content: [{ type: 'text' as const, text }] };
    },
  };
}
