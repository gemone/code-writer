import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DatabaseManager } from '../engine/database.js';
import { LanguageLoader } from '../engine/loader.js';
import { QueryEngine } from '../engine/query.js';
import { VectorStore } from '../engine/vector-store.js';
import { createEmbeddingProvider, loadEmbeddingConfig } from '../engine/embedding.js';
import { indexLanguage } from '../engine/indexer.js';
import type { EmbeddingProvider } from '../engine/embedding.js';
import { createLangRefTool } from '../tools/lang-ref.js';
import { createLangSearchTool } from '../tools/lang-search.js';
import { createLangConventionsTool } from '../tools/lang-conventions.js';
import { createLangCompareTool } from '../tools/lang-compare.js';
import { createLangFetchTool } from '../tools/lang-fetch.js';
import { createLangAstTool } from '../tools/lang-ast.js';
import { createLangIndexTool } from '../tools/lang-index.js';
import { createLangLspTool } from '../tools/lang-lsp.js';
import { LspClientManager } from '../engine/lsp-client.js';
import { ensureDataDir } from '../engine/constants.js';

async function main() {
  ensureDataDir();

  const db = new DatabaseManager();
  const loader = new LanguageLoader(db);
  const queryEngine = new QueryEngine(db);

  // Sync YAML data to DB on startup (conventions, patterns → SQLite)
  await loader.syncFromYaml();

  // Initialize vector store and embedding provider
  let vectorStore: VectorStore | null = null;
  let embedding: EmbeddingProvider | null = null;
  const lspManager = new LspClientManager();

  try {
    const embConfig = loadEmbeddingConfig();
    embedding = await createEmbeddingProvider(embConfig);
    vectorStore = new VectorStore(embedding.dimension);
    await vectorStore.loadOrInitialize();

    // Auto-index languages that aren't indexed yet (fire-and-forget for fast MCP startup;
    // tools fall back to SQLite when vector search isn't ready)
    const indexing: Promise<void>[] = [];
    for (const lang of loader.getRegisteredLanguages()) {
      if (!vectorStore.isIndexed(lang)) {
        indexing.push(
          indexLanguage(lang, loader, vectorStore, embedding, db)
            .then(result => {
              if (result.indexed > 0) {
                console.error(`[code-writer] Auto-indexed ${result.language}: ${result.indexed} documents`);
              }
            })
            .catch(err => {
              console.error(`[code-writer] Failed to index ${lang}:`, err.message);
            })
        );
      }
    }

    // Graceful shutdown: persist vector indexes before exit
    const shutdown = async () => {
      await Promise.allSettled(indexing);
      await vectorStore?.persist();
      await lspManager.shutdownAll();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error(`[code-writer] Vector search unavailable:`, (err as Error).message);
  }

  const langRefTool = createLangRefTool(queryEngine, loader, vectorStore, embedding);
  const langSearchTool = createLangSearchTool(queryEngine, vectorStore, embedding);
  const langConventionsTool = createLangConventionsTool(queryEngine);
  const langCompareTool = createLangCompareTool(queryEngine, vectorStore, embedding);
  const langFetchTool = createLangFetchTool(queryEngine, loader);
  const langAstTool = createLangAstTool();
  const langLspTool = createLangLspTool(lspManager);
  const langIndexTool = vectorStore && embedding
    ? createLangIndexTool(loader, vectorStore, embedding, db)
    : null;

  const tools = [
    langRefTool,
    langSearchTool,
    langConventionsTool,
    langCompareTool,
    langFetchTool,
    langAstTool,
    langLspTool,
    ...(langIndexTool ? [langIndexTool] : []),
  ];

  const server = new Server(
    { name: 'code-writer', version: '0.1.1' },
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
