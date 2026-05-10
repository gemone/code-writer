import type { DatabaseManager } from '../engine/database.js';
import type { VectorStore } from '../engine/vector-store.js';
import type { EmbeddingProvider } from '../engine/embedding.js';
import { DepApiSchema, DepPatternSchema, DepConsiderationSchema } from '../engine/types.js';
import { resolveDepAlias } from '../shared/dep-aliases.js';
import { isStdlibModule } from '../shared/stdlib-modules.js';

export function createDepFetchTool(
  db: DatabaseManager,
  vectorStore?: VectorStore | null,
  embedding?: EmbeddingProvider | null,
) {
  return {
    name: 'dep_fetch' as const,
    description: 'Fetch and register dependency library data. Phase 1: scaffolds entry and returns instructions. Phase 2: accepts populated data and syncs to database. Use Context7 resolve-library-id + query-docs to gather data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryName: { type: 'string', description: 'Library name (e.g., "express", "react", "fastapi")' },
        version: { type: 'string', description: 'Version range or exact version (e.g., "^18.0.0", "4.18.2")' },
        language: { type: 'string', description: 'Programming language (e.g., "typescript", "python")' },
        force: { type: 'boolean', default: false, description: 'Re-fetch even if data already exists' },
        data: {
          type: 'object' as const,
          description: 'Phase 2: populated data (registry, apis, patterns, considerations)',
          properties: {
            registry: { type: 'object' },
            apis: { type: 'array', items: { type: 'object' } },
            patterns: { type: 'array', items: { type: 'object' } },
            considerations: { type: 'array', items: { type: 'object' } },
          },
        },
      },
      required: ['libraryName', 'language'],
    },
    handler: async (args: {
      libraryName: string; version?: string; language: string;
      force?: boolean; data?: {
        registry?: Record<string, unknown>;
        apis?: Record<string, unknown>[];
        patterns?: Record<string, unknown>[];
        considerations?: Record<string, unknown>[];
      };
    }) => {
      try {
        const canonicalName = resolveDepAlias(args.libraryName);
        const version = args.version || 'latest';
        const language = args.language.toLowerCase();

        if (isStdlibModule(canonicalName, language)) {
          return {
            content: [{
              type: 'text' as const,
              text: `"${canonicalName}" is a standard library module for ${language}. Use \`lang_ref\` or \`lang_search\` instead.`,
            }],
          };
        }

        if (args.data) {
          return await handlePhase2(db, canonicalName, version, language, args.data, vectorStore, embedding);
        }
        return handlePhase1(db, canonicalName, version, language, args.force || false);
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error in dep_fetch: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  };
}

function handlePhase1(db: DatabaseManager, libraryName: string, version: string, language: string, force: boolean) {
  const cached = db.findCachedDep(libraryName, language, version);
  if (cached && !force) {
    const record = db.getDepRegistry(cached.dep_id as string);
    return {
      content: [{
        type: 'text' as const,
        text: [
          `Library "${libraryName}" (${version}) for ${language} is already cached.`,
          `Dep ID: ${cached.dep_id}`,
          record?.description ? `Description: ${record.description}` : '',
          '',
          'Use `dep_explore` to view cached data, or set `force: true` to re-fetch.',
        ].filter(Boolean).join('\n'),
      }],
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: [
        `Ready to fetch dependency data for "${libraryName}" (${version}) in ${language}.`,
        '',
        '**Next step:** Gather library data using these tools:',
        '',
        '1. **Resolve the library:**',
        `   - Context7: \`resolve-library-id(query: "${libraryName} ${language}", libraryName: "${libraryName}")\``,
        '',
        '2. **Fetch API documentation:**',
        `   - Context7: \`query-docs(libraryId: "<resolved_id>", query: "${libraryName} API reference functions methods")\``,
        '',
        '3. **Fetch usage patterns:**',
        `   - Context7: \`query-docs(libraryId: "<resolved_id>", query: "${libraryName} usage examples patterns setup")\``,
        '',
        '4. **Fetch considerations:**',
        `   - Context7: \`query-docs(libraryId: "<resolved_id>", query: "${libraryName} breaking changes migration deprecation security")\``,
        '',
        '5. **Call dep_fetch Phase 2 with the gathered data:**',
        '```',
        `dep_fetch(libraryName: "${libraryName}", version: "${version}", language: "${language}", data: {`,
        '  registry: { context7Id: "<id>", description: "..." },',
        '  apis: [{ module: "...", exportName: "...", description: "...", signature: "..." }]',
        '  patterns: [{ name: "...", description: "...", codeExample: "..." }]',
        '  considerations: [{ title: "...", category: "security", description: "..." }]',
        '})',
        '```',
      ].join('\n'),
    }],
  };
}

async function handlePhase2(
  db: DatabaseManager,
  libraryName: string,
  version: string,
  language: string,
  data: {
    registry?: Record<string, unknown>;
    apis?: Record<string, unknown>[];
    patterns?: Record<string, unknown>[];
    considerations?: Record<string, unknown>[];
  },
  vectorStore?: VectorStore | null,
  embedding?: EmbeddingProvider | null,
) {
  const depId = `${libraryName}@${version}`;

  const validatedApis = (data.apis || []).map(a => DepApiSchema.parse(a));
  const validatedPatterns = (data.patterns || []).map(p => DepPatternSchema.parse(p));
  const validatedConsiderations = (data.considerations || []).map(c => DepConsiderationSchema.parse(c));

  const counts = db.runInTransaction(() => {
    db.insertDepRegistry({
      id: depId,
      libraryName,
      resolvedVersion: (data.registry?.resolvedVersion as string) || version,
      versionRange: (data.registry?.versionRange as string) || version,
      language,
      packageManager: (data.registry?.packageManager as string) || undefined,
      description: (data.registry?.description as string) || undefined,
      sourceUrl: (data.registry?.sourceUrl as string) || undefined,
      context7Id: (data.registry?.context7Id as string) || undefined,
      metadata: data.registry?.metadata as Record<string, unknown> | undefined,
    });

    for (const api of validatedApis) {
      db.insertDepApi({ depId, ...api });
    }

    for (const pat of validatedPatterns) {
      db.insertDepPattern({ depId, ...pat });
    }

    for (const con of validatedConsiderations) {
      db.insertDepConsideration({ depId, ...con });
    }

    db.insertDepVersionCache({
      libraryName,
      language,
      versionRange: (data.registry?.versionRange as string) || version,
      resolvedVersion: (data.registry?.resolvedVersion as string) || version,
      depId,
    });

    return {
      apiCount: validatedApis.length,
      patternCount: validatedPatterns.length,
      considerationCount: validatedConsiderations.length,
    };
  });

  // Index into vector store if available
  let indexed = 0;
  if (vectorStore && embedding) {
    try {
      const { indexDependency } = await import('../engine/dep-indexer.js');
      const result = await indexDependency(depId, db, vectorStore, embedding);
      indexed = result.indexed;
    } catch (err) {
      console.error('[code-writer] Dep vector indexing failed:', (err as Error).message);
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: [
        `Dependency data for "${libraryName}" (${version}) synced to database.`,
        '',
        `Dep ID: ${depId}`,
        `APIs: ${counts.apiCount}`,
        `Patterns: ${counts.patternCount}`,
        `Considerations: ${counts.considerationCount}`,
        ...(indexed > 0 ? [`Vector indexed: ${indexed} documents`] : []),
        '',
        'Use:',
        `- \`dep_explore(libraryName: "${libraryName}", language: "${language}")\` to view`,
        `- \`dep_search(query: "...", language: "${language}")\` to search`,
      ].join('\n'),
    }],
  };
}
