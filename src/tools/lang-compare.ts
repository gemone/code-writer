import type { QueryEngine } from '../engine/query.js';

export function createLangCompareTool(queryEngine: QueryEngine) {
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
      const result = queryEngine.compare(
        args.concept,
        args.languages.map(l => l.toLowerCase())
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
