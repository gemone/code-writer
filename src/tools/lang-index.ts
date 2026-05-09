import type { LanguageLoader } from '../engine/loader.js';
import type { VectorStore } from '../engine/vector-store.js';
import type { EmbeddingProvider } from '../engine/embedding.js';
import type { DatabaseManager } from '../engine/database.js';
import { indexLanguage } from '../engine/indexer.js';

export function createLangIndexTool(
  loader: LanguageLoader,
  vectorStore: VectorStore,
  embedding: EmbeddingProvider,
  db: DatabaseManager,
) {
  return {
    name: 'lang_index' as const,
    description: 'Index a language\'s standard library source files into the vector search engine. Discovers local stdlib files, chunks them into searchable documents, generates embeddings, and stores in Orama.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        language: { type: 'string', description: 'Programming language name (e.g., "zig", "rust", "go")' },
        version: { type: 'string', description: 'Language version (e.g., "0.16", "1.77")' },
        modules: { type: 'array', items: { type: 'string' }, description: 'Specific modules to fetch (optional, fetches all if omitted)' },
        force: { type: 'boolean', default: false, description: 'Re-fetch even if data already exists' },
        data: { type: 'object', description: 'Phase 2: populated YAML data to write (stdlib, syntax, conventions, patterns)' },
      },
      required: ['language'],
    },
    handler: async (args: { language: string; version?: string; modules?: string[]; force?: boolean; data?: Record<string, unknown> }) => {
      const lang = args.language.toLowerCase();

      // Check if already indexed
      if (!args.force && vectorStore.isIndexed(lang)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Language "${lang}" is already indexed. Use force: true to re-index.`,
          }],
        };
      }

      // Check if language is registered
      const meta = loader.loadLanguageMeta(lang);
      if (!meta) {
        return {
          content: [{
            type: 'text' as const,
            text: `Language "${lang}" is not registered. Available languages: ${loader.getRegisteredLanguages().join(', ')}`,
          }],
          isError: true,
        };
      }

      const result = await indexLanguage(lang, loader, vectorStore, embedding, db);

      return {
        content: [{
          type: 'text' as const,
          text: `Indexed ${result.language}: ${result.filesDiscovered} files discovered, ${result.chunksCreated} chunks created, ${result.indexed} documents stored.`,
        }],
      };
    },
  };
}
