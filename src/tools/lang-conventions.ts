import type { QueryEngine } from '../engine/query.js';

export function createLangConventionsTool(queryEngine: QueryEngine) {
  return {
    name: 'lang_conventions' as const,
    description: 'Retrieve coding conventions for a language. Returns rules with severity levels, good/bad examples, and rationale.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        language: { type: 'string', description: 'Language (omit for all conventions)' },
        topic: { type: 'string', description: "Specific topic (e.g., 'naming', 'error-handling', 'imports')" },
        severity: { type: 'string', enum: ['error', 'warn', 'info', 'all'], default: 'all' },
      },
      required: [],
    },
    handler: async (args: { language?: string; topic?: string; severity?: string }) => {
      const conventions = queryEngine.getConventions(args.language?.toLowerCase(), {
        topic: args.topic,
        severity: (args.severity as 'error' | 'warn' | 'info' | 'all') || 'all',
      });

      if (conventions.length === 0) {
        return { content: [{ type: 'text' as const, text: `No conventions found${args.language ? ` for ${args.language}` : ''}.` }] };
      }

      let text = `# Coding Conventions${args.language ? ` - ${args.language}` : ''}\n\n`;

      for (const conv of conventions) {
        const severity = conv.severity || 'info';
        const icon = severity === 'error' ? '🔴' : severity === 'warn' ? '🟡' : '🔵';
        text += `## ${icon} ${conv.name}\n`;
        text += `**Severity:** ${severity}\n\n`;
        text += `${conv.rule}\n\n`;

        if (conv.good_example) {
          text += `### Good\n\`\`\`\n${conv.good_example}\n\`\`\`\n\n`;
        }
        if (conv.bad_example) {
          text += `### Bad\n\`\`\`\n${conv.bad_example}\n\`\`\`\n\n`;
        }
        if (conv.rationale) {
          text += `**Why:** ${conv.rationale}\n\n`;
        }
        text += `---\n\n`;
      }

      return { content: [{ type: 'text' as const, text }] };
    },
  };
}
