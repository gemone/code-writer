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
      if (vectorStore && embedding) {
        const queryVector = await embedding.embed(args.concept).catch(() => null);
        if (queryVector) {
          const langResults = await Promise.all(
            args.languages.map(async lang => {
              const vectorText = await searchWithVector(vectorStore, args.concept, queryVector, {
                language: lang.toLowerCase(),
                limit: 5,
              }, hits => {
                let text = '';
                for (const { document: doc } of hits) {
                  text += `### ${doc.name} (${doc.module})\n`;
                  if (doc.signature) text += `\`${doc.signature}\`\n\n`;
                  text += `${doc.description}\n\n`;
                  if (doc.code) text += `\`\`\`\n${doc.code}\n\`\`\`\n\n`;
                }
                return text;
              });
              return { lang, vectorText };
            })
          );

          if (langResults.some(r => r.vectorText !== null)) {
            let text = `# Comparing: ${args.concept}\n\n`;
            for (const { lang, vectorText } of langResults) {
              text += `## ${lang}\n\n`;
              text += vectorText || 'No matching content found.\n\n';
            }
            return { content: [{ type: 'text' as const, text }] };
          }
        }
      }

      // Fallback to SQLite
      const result = queryEngine.compare(
        args.concept,
        args.languages.map(l => l.toLowerCase()),
      );

      let text = `# Comparing: ${args.concept}\n\n`;
      for (const lang of result.languages) {
        text += `## ${lang.language}\n\n`;
        if (lang.sections.length === 0) {
          text += `No matching content found.\n\n`;
          continue;
        }
        for (const section of lang.sections) {
          text += `### ${section.source}\n`;
          text += `${section.content}\n\n`;
        }
      }

      return { content: [{ type: 'text' as const, text }] };
    },
  };
}
