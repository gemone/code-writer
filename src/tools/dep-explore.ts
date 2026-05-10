import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from '../engine/database.js';
import type { DepQueryEngine } from '../engine/dep-query.js';
import { resolveDepAlias } from '../shared/dep-aliases.js';
import { isStdlibModule } from '../shared/stdlib-modules.js';
import { detectProjectDependencies } from '../engine/version-detector.js';

export function createDepExploreTool(db: DatabaseManager, queryEngine: DepQueryEngine) {
  return {
    name: 'dep_explore' as const,
    description: 'Explore a dependency library: view cached APIs, patterns, and considerations. If not cached, returns instructions to fetch. Auto-detects version from project manifests.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        libraryName: { type: 'string', description: 'Library name (e.g., "express", "react")' },
        version: { type: 'string', description: 'Version range (auto-detected if omitted)' },
        language: { type: 'string', description: 'Language (auto-detected if omitted)' },
        projectPath: { type: 'string', description: 'Project root path for version detection (optional)' },
        section: { type: 'string', enum: ['apis', 'patterns', 'considerations', 'all'], default: 'all', description: 'Which section to show' },
        force: { type: 'boolean', default: false, description: 'Force re-fetch even if cached' },
      },
      required: ['libraryName'],
    },
    handler: async (args: {
      libraryName: string; version?: string; language?: string;
      projectPath?: string; section?: string; force?: boolean;
    }) => {
      try {
        const canonicalName = resolveDepAlias(args.libraryName);
        const section = args.section || 'all';

        if (isStdlibModule(canonicalName, args.language || '')) {
          return {
            content: [{
              type: 'text' as const,
              text: `"${canonicalName}" is a standard library module. Use \`lang_ref(language: "${args.language}")\` or \`lang_search(query: "${canonicalName}")\` instead.`,
            }],
          };
        }

        // Resolve version/language from project if not provided
        let version = args.version;
        let language = args.language;

        if (!version || !language) {
          const projectPath = args.projectPath || process.cwd();
          const resolved = path.resolve(projectPath);
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
            return {
              content: [{ type: 'text' as const, text: `Invalid project path: ${projectPath}` }],
              isError: true,
            };
          }
          const detected = detectFromProject(resolved, canonicalName);
          if (!language) language = detected.language;
          if (!version) version = detected.version;
        }

      language = language!.toLowerCase();

      // Check cache
      const cached = db.findCachedDep(canonicalName, language, version || 'latest');
      if (!cached || args.force) {
        return {
          content: [{
            type: 'text' as const,
            text: [
              `No cached data for "${canonicalName}" (${version || 'latest'}) in ${language}.`,
              '',
              '**Fetch it now:**',
              `1. \`dep_fetch(libraryName: "${canonicalName}", version: "${version || 'latest'}", language: "${language}")\``,
              '2. Follow the Phase 1 instructions to gather data via Context7',
              '3. Call dep_fetch Phase 2 with the populated data',
              '',
              'Then re-run dep_explore to view the results.',
            ].join('\n'),
          }],
        };
      }

      // Render cached data
      const depId = cached.dep_id as string;
      let text = `# ${canonicalName} (${cached.resolved_version}) — ${language}\n\n`;

      if (section === 'all' || section === 'apis') {
        const apis = queryEngine.getDepApis(depId);
        if (apis.length > 0) {
          text += `## API Surface (${apis.length} exports)\n\n`;
          text += '| Module | Export | Kind | Description |\n';
          text += '|--------|--------|------|-------------|\n';
          for (const api of apis) {
            const mod = api.module as string;
            const name = api.export_name as string;
            const kind = api.export_kind as string;
            const desc = (api.description as string || '').split('\n')[0].slice(0, 80);
            text += `| ${mod} | \`${name}\` | ${kind} | ${desc} |\n`;
          }
          text += '\n';
        }
      }

      if (section === 'all' || section === 'patterns') {
        const patterns = queryEngine.getDepPatterns(depId);
        if (patterns.length > 0) {
          text += `## Patterns (${patterns.length})\n\n`;
          for (const pat of patterns) {
            const cat = pat.category as string;
            text += `### ${pat.name}${cat ? ` (${cat})` : ''}\n\n`;
            text += `${pat.description}\n\n`;
            if (pat.code_example) {
              text += `\`\`\`\n${pat.code_example}\n\`\`\`\n\n`;
            }
          }
        }
      }

      if (section === 'all' || section === 'considerations') {
        const considerations = queryEngine.getDepConsiderations(depId);
        if (considerations.length > 0) {
          text += `## Considerations (${considerations.length})\n\n`;
          for (const con of considerations) {
            const sev = con.severity as string;
            const cat = con.category as string;
            const icon = sev === 'critical' ? 'CRITICAL' : sev === 'warning' ? 'WARNING' : 'INFO';
            text += `### [${icon}] ${con.title} (${cat})\n\n`;
            text += `${con.description}\n\n`;
            if (con.fix_suggestion) {
              text += `**Fix:** ${con.fix_suggestion}\n\n`;
            }
          }
        }
      }

      return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error in dep_explore: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  };
}

function detectFromProject(projectPath: string, libraryName: string): { language: string; version: string } {
  try {
    const allDeps = detectProjectDependencies(projectPath);
    for (const projectDep of allDeps) {
      const match = projectDep.dependencies.find(d =>
        d.name === libraryName || resolveDepAlias(d.name) === libraryName
      );
      if (match) {
        return { language: match.language, version: match.version || 'latest' };
      }
    }
    // Fall back to first detected language
    if (allDeps.length > 0) {
      return { language: allDeps[0].language, version: 'latest' };
    }
  } catch { /* detection failed */ }
  return { language: 'typescript', version: 'latest' };
}
