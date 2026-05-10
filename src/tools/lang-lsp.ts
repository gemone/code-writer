import { fileURLToPath } from 'node:url';
import { LspClientManager } from '../engine/lsp-client.js';

export function createLangLspTool(lspManager: LspClientManager) {
  return {
    name: 'lang_lsp' as const,
    description: 'Interact with Language Server Protocol (LSP) servers to get code intelligence features.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        language: { type: 'string', description: "Programming language (e.g., 'typescript', 'python')" },
        operation: {
          type: 'string',
          enum: ['hover', 'definition', 'references', 'diagnostics', 'documentSymbol'],
          description: 'LSP operation to perform',
        },
        filePath: { type: 'string', description: 'Absolute path to the source file' },
        line: { type: 'number', description: 'Line number (1-based). Required for hover, definition, references.' },
        character: { type: 'number', description: 'Character offset (1-based). Required for hover, definition, references.' },
        rootUri: { type: 'string', description: 'Root URI for the project (file:// URI or absolute path). Defaults to file:///' },
      },
      required: ['language', 'operation', 'filePath'],
    },
    handler: async (args: {
      language: string;
      operation: string;
      filePath: string;
      line?: number;
      character?: number;
      rootUri?: string;
    }) => {
      const lang = args.language.toLowerCase();
      const rootUri = args.rootUri || 'file:///';

      try {
        const client = await lspManager.getClient(lang, rootUri);

        switch (args.operation) {
          case 'hover':
            return await handleHover(client, args.filePath, args.line, args.character);
          case 'definition':
            return await handleLocations('definition', (l, c) => client.definition(args.filePath, l, c), args.filePath, args.line, args.character);
          case 'references':
            return await handleLocations('references', (l, c) => client.references(args.filePath, l, c), args.filePath, args.line, args.character);
          case 'diagnostics':
            return await handleDiagnostics(client, args.filePath);
          case 'documentSymbol':
            return await handleDocumentSymbols(client, args.filePath);
          default:
            return {
              content: [{ type: 'text' as const, text: `Unknown operation: ${args.operation}. Use: hover, definition, references, diagnostics, documentSymbol` }],
              isError: true,
            };
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `LSP error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  };
}

async function handleHover(client: any, filePath: string, line?: number, character?: number) {
  if (line == null || character == null) {
    return {
      content: [{ type: 'text' as const, text: 'line and character are required for hover operation.' }],
      isError: true,
    };
  }

  const result = await client.hover(filePath, line, character);

  if (!result) {
    return { content: [{ type: 'text' as const, text: 'No hover information available at this position.' }] };
  }

  let text = `# Hover Info\n\n**File:** ${filePath}\n**Position:** ${line}:${character}\n\n`;
  text += result.contents;

  return { content: [{ type: 'text' as const, text }] };
}

async function handleLocations(
  operation: string,
  fetchLocations: (line: number, character: number) => Promise<any[]>,
  filePath: string,
  line?: number,
  character?: number,
) {
  if (line == null || character == null) {
    return {
      content: [{ type: 'text' as const, text: `line and character are required for ${operation} operation.` }],
      isError: true,
    };
  }

  const locations = await fetchLocations(line, character);
  const label = operation === 'definition' ? 'Definitions' : 'References';

  if (locations.length === 0) {
    return { content: [{ type: 'text' as const, text: `No ${label.toLowerCase()} found.` }] };
  }

  let text = `# ${label}\n\n**File:** ${filePath}\n**Position:** ${line}:${character}\n**Found:** ${locations.length}\n\n`;
  for (const loc of locations) {
    const locPath = loc.uri.startsWith('file://') ? fileURLToPath(loc.uri) : loc.uri;
    const pos = loc.range.start;
    text += `- ${locPath}:${pos.line + 1}:${pos.character + 1}\n`;
  }

  return { content: [{ type: 'text' as const, text }] };
}

async function handleDiagnostics(client: any, filePath: string) {
  const diagnostics = await client.diagnostics(filePath);

  if (diagnostics.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No diagnostics reported for this file.' }] };
  }

  let text = `# Diagnostics\n\n**File:** ${filePath}\n**Issues:** ${diagnostics.length}\n\n`;
  for (const d of diagnostics) {
    const icon = d.severity === 'error' ? '🔴' : d.severity === 'warning' ? '🟡' : '🔵';
    text += `${icon} **Line ${d.line + 1}:${d.character + 1}** — ${d.message}`;
    if (d.source) text += ` (${d.source})`;
    text += '\n';
  }

  return { content: [{ type: 'text' as const, text }] };
}

async function handleDocumentSymbols(client: any, filePath: string) {
  const symbols = await client.documentSymbols(filePath);

  if (symbols.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No document symbols found.' }] };
  }

  let text = `# Document Symbols\n\n**File:** ${filePath}\n**Symbols:** ${symbols.length}\n\n`;
  for (const sym of symbols) {
    const kind = (sym as any).kind;
    const name = (sym as any).name;
    const range = (sym as any).range;
    text += `- **${name}** (kind: ${kind})`;
    if (range) text += ` — Line ${range.start.line + 1}:${range.start.character + 1}`;
    text += '\n';
  }

  return { content: [{ type: 'text' as const, text }] };
}
