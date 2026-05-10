import type { DepQueryEngine } from '../engine/dep-query.js';
import type { VectorStore } from '../engine/vector-store.js';
import type { EmbeddingProvider } from '../engine/embedding.js';
import { tryDepVectorSearch, depSearchWithVector, type DepSearchHit } from './vector-search.js';
import { resolveDepAlias } from '../shared/dep-aliases.js';

function renderDepSqliteResults(results: { source: string; libraryName: string; version: string; section: string; name: string; snippet: string }[]): string {
  let text = '';
  for (const r of results) {
    text += `## [${r.source}] ${r.name} (${r.libraryName}@${r.version})\n`;
    text += `Section: ${r.section}\n\n`;
    text += `${r.snippet}\n\n---\n\n`;
  }
  return text;
}

function renderDepVectorHits(hits: DepSearchHit[]): string {
  let text = '';
  for (const { document: doc, score } of hits) {
    text += `## [${doc.source}] ${doc.name} (${doc.library}@${doc.version})\n`;
    text += `Language: ${doc.language}\n\n`;
    if (doc.signature) text += `Signature: \`${doc.signature}\`\n\n`;
    text += `${doc.description}\n\n`;
    if (doc.code) text += `\`\`\`\n${doc.code}\n\`\`\`\n\n`;
    text += `Score: ${score.toFixed(3)}\n\n---\n\n`;
  }
  return text;
}

export function createDepSearchTool(
  queryEngine: DepQueryEngine,
  vectorStore: VectorStore | null,
  embedding: EmbeddingProvider | null,
) {
  return {
    name: 'dep_search' as const,
    description: 'Search dependency library data: APIs, usage patterns, and considerations. Searches across all cached dependencies.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (API name, concept, pattern)' },
        language: { type: 'string', description: 'Restrict to a specific language' },
        libraryName: { type: 'string', description: 'Restrict to a specific library' },
        category: { type: 'string', enum: ['apis', 'patterns', 'considerations', 'all'], default: 'all', description: 'Category to search' },
        limit: { type: 'number', minimum: 1, maximum: 20, default: 5 },
      },
      required: ['query'],
    },
    handler: async (args: { query: string; language?: string; libraryName?: string; category?: string; limit?: number }) => {
      try {
        const language = args.language?.toLowerCase();
        const libraryName = args.libraryName ? resolveDepAlias(args.libraryName) : undefined;
        const category = args.category || 'all';
        const limit = args.limit || 5;

        const sqliteResults = queryEngine.search(args.query, {
          language,
          libraryName,
          category: category as 'apis' | 'patterns' | 'considerations' | 'all',
          limit,
        });

        // If SQLite fills the limit, return immediately
        if (sqliteResults.length >= limit) {
          return { content: [{ type: 'text' as const, text: `# Dependency Search Results for "${args.query}"\n\n${renderDepSqliteResults(sqliteResults)}` }] };
        }

        // Dep-specific vector search fallback
        const seen = new Set(sqliteResults.map(r => `${r.source}:${r.name}`));
        let vectorHits: DepSearchHit[] = [];
        if (vectorStore && embedding) {
          const depKeys = vectorStore.getIndexedDepKeys();
          const remaining = limit - sqliteResults.length;

          const queryVector = await embedding.embed(args.query).catch(() => null);
          if (queryVector) {
            const perKeyLimit = Math.max(remaining, 3);
            const allHits = await Promise.all(
              depKeys.map(key =>
                depSearchWithVector(vectorStore, key, args.query, queryVector, {
                  language,
                  library: libraryName,
                  limit: perKeyLimit,
                  similarity: 0.6,
                })
              )
            );

            vectorHits = allHits
              .flat()
              .filter(h => !seen.has(`${h.document.source}:${h.document.name}`))
              .sort((a, b) => b.score - a.score)
              .slice(0, remaining);
          }
        }

        if (sqliteResults.length === 0 && vectorHits.length === 0) {
          return { content: [{ type: 'text' as const, text: `No dependency results found for "${args.query}". Use \`dep_fetch\` to cache library data first.` }] };
        }

        const text = `# Dependency Search Results for "${args.query}"\n\n${renderDepSqliteResults(sqliteResults)}${renderDepVectorHits(vectorHits)}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error in dep_search: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  };
}
