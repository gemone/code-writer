import type { QueryEngine } from '../engine/query.js';

export function createLangSearchTool(queryEngine: QueryEngine) {
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
      const results = queryEngine.search(args.query, {
        language: args.language?.toLowerCase(),
        category: (args.category as 'stdlib' | 'syntax' | 'conventions' | 'patterns' | 'all') || 'all',
        limit: args.limit || 5,
      });

      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No results found for "${args.query}".` }] };
      }

      let text = `# Search Results for "${args.query}"\n\n`;
      for (const r of results) {
        text += `## [${r.source}] ${r.name} (${r.language})\n`;
        text += `Section: ${r.section}\n\n`;
        text += `${r.snippet}\n\n---\n\n`;
      }

      return { content: [{ type: 'text' as const, text }] };
    },
  };
}
