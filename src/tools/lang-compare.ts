import type { QueryEngine } from '../engine/query.js';
import type { VectorStore } from '../engine/vector-store.js';
import type { EmbeddingProvider } from '../engine/embedding.js';
import { searchWithVector } from './vector-search.js';
import type { VectorDocument } from './vector-search.js';

export function createLangCompareTool(
  queryEngine: QueryEngine,
  vectorStore: VectorStore | null,
  embedding: EmbeddingProvider | null,
) {
  return {
    name: 'lang_compare' as const,
    description: 'Compare syntax or patterns across multiple languages. Shows how the same concept is expressed in different languages.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        concept: { type: 'string', description: "Concept to compare (e.g., 'error handling', 'async', 'generics')" },
        languages: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5, description: 'Languages to compare' },
        format: { type: 'string', enum: ['side-by-side', 'sequential'], default: 'side-by-side' },
      },
      required: ['concept', 'languages'],
    },
    handler: async (args: { concept: string; languages: string[]; format?: string }) => {
      // SQLite first: curated conventions, patterns, and syntax
      const result = queryEngine.compare(
        args.concept,
        args.languages.map(l => l.toLowerCase()),
      );

      let text = `# Comparing: ${args.concept}\n\n`;
      const hasSQLite = result.languages.some(l => l.sections.length > 0);

      for (const lang of result.languages) {
        text += `## ${lang.language}\n\n`;
        if (lang.sections.length > 0) {
          for (const section of lang.sections) {
            text += `### ${section.source}\n`;
            text += `${section.content}\n\n`;
          }
        } else {
          text += 'No matching content found.\n\n';
        }
      }

      if (hasSQLite) return { content: [{ type: 'text' as const, text }] };

      // Fallback to vector search only if SQLite found nothing
      if (vectorStore && embedding) {
        const queryVector = await embedding.embed(args.concept).catch(() => null);
        if (queryVector) {
          const vectorTexts = await Promise.all(
            args.languages.map(lang =>
              searchWithVector(vectorStore, args.concept, queryVector, {
                language: lang.toLowerCase(),
                limit: 5,
              }, hits => {
                let t = '';
                for (const { document: doc } of hits) {
                  t += `### ${doc.name} (${doc.module})\n`;
                  if (doc.signature) t += `\`${doc.signature}\`\n\n`;
                  t += `${doc.description}\n\n`;
                  if (doc.code) t += `\`\`\`\n${doc.code}\n\`\`\`\n\n`;
                }
                return t;
              })
            )
          );
          text = `# Comparing: ${args.concept}\n\n`;
          for (let i = 0; i < args.languages.length; i++) {
            text += `## ${args.languages[i]}\n\n`;
            text += vectorTexts[i] || 'No matching content found.\n\n';
          }
          return { content: [{ type: 'text' as const, text }] };
        }
      }

      return { content: [{ type: 'text' as const, text }] };
    },
  };
}
