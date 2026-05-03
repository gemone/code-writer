import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DatabaseManager } from '../engine/database.js';
import { LanguageLoader } from '../engine/loader.js';
import { QueryEngine } from '../engine/query.js';
import { createLangRefTool } from '../tools/lang-ref.js';
import { createLangSearchTool } from '../tools/lang-search.js';
import { createLangConventionsTool } from '../tools/lang-conventions.js';
import { createLangCompareTool } from '../tools/lang-compare.js';
import { createLangFetchTool } from '../tools/lang-fetch.js';

async function main() {
  const db = new DatabaseManager();
  const loader = new LanguageLoader(db);
  const queryEngine = new QueryEngine(db);

  // Sync YAML data to DB on startup
  await loader.syncFromYaml();

  const langRefTool = createLangRefTool(queryEngine, loader);
  const langSearchTool = createLangSearchTool(queryEngine);
  const langConventionsTool = createLangConventionsTool(queryEngine);
  const langCompareTool = createLangCompareTool(queryEngine);
  const langFetchTool = createLangFetchTool(queryEngine, loader);

  const tools = [langRefTool, langSearchTool, langConventionsTool, langCompareTool, langFetchTool];

  const server = new Server(
    { name: 'code-standards', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await tool.handler(request.params.arguments as any);
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
