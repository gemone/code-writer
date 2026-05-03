import type { QueryEngine } from '../engine/query.js';
import type { LanguageLoader } from '../engine/loader.js';

export function createLangRefTool(queryEngine: QueryEngine, loader: LanguageLoader) {
  return {
    name: 'lang_ref' as const,
    description: 'Look up programming language standard library API reference. Returns method signatures, descriptions, examples, and usage notes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        language: { type: 'string', description: "Programming language (e.g., 'typescript', 'python', 'rust')" },
        module: { type: 'string', description: "Module or class name (e.g., 'Array', 'os', 'HashMap')" },
        method: { type: 'string', description: 'Specific method or function name' },
        depth: { type: 'string', enum: ['summary', 'full'], default: 'full', description: 'Detail level' },
      },
      required: ['language'],
    },
    handler: async (args: { language: string; module?: string; method?: string; depth?: string }) => {
      const depth = args.depth || 'full';
      const lang = args.language.toLowerCase();

      // If only language, return meta + quick reference
      if (!args.module) {
        const meta = loader.loadLanguageMeta(lang);
        if (!meta) {
          return { content: [{ type: 'text' as const, text: `Language "${args.language}" not found in the standards library.` }], isError: true };
        }
        const quickRef = (meta as Record<string, unknown>).quickReference as Record<string, string> | undefined;
        let text = `# ${(meta as Record<string, unknown>).name} ${(meta as Record<string, unknown>).version}\n\n`;
        if ((meta as Record<string, unknown>).description) text += `${(meta as Record<string, unknown>).description}\n\n`;
        if (quickRef) {
          text += `## Quick Reference\n\n`;
          for (const [key, value] of Object.entries(quickRef)) {
            text += `### ${key}\n\`\`\`\n${value}\n\`\`\`\n\n`;
          }
        }
        return { content: [{ type: 'text' as const, text }] };
      }

      // If module specified
      const methods = queryEngine.getMethod(lang, args.module, args.method);
      if (methods.length === 0) {
        return { content: [{ type: 'text' as const, text: `No results for ${args.module}${args.method ? '.' + args.method : ''} in ${args.language}.` }] };
      }

      let text = `# ${args.language} - ${args.module}\n\n`;
      for (const m of methods) {
        text += `## ${m.method}\n`;
        if (m.signature) text += `\`${m.signature}\`\n\n`;
        text += `${m.description}\n\n`;
        if (depth === 'full' && m.example) {
          text += `### Example\n\`\`\`\n${m.example}\n\`\`\`\n\n`;
        }
        if (m.tags) {
          const tags = typeof m.tags === 'string' ? JSON.parse(m.tags) : m.tags;
          text += `Tags: ${tags.join(', ')}\n\n`;
        }
      }

      return { content: [{ type: 'text' as const, text }] };
    },
  };
}
