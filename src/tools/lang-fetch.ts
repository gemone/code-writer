import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { QueryEngine } from '../engine/query.js';
import type { LanguageLoader } from '../engine/loader.js';
import { DATA_DIR } from '../engine/constants.js';

const TEMPLATE_FILES = ['language.yaml', 'stdlib.yaml', 'syntax.yaml', 'conventions.yaml', 'patterns.yaml'];

export function createLangFetchTool(queryEngine: QueryEngine, loader: LanguageLoader) {
  return {
    name: 'lang_fetch' as const,
    description: 'Fetch and register language data for a programming language. This is the standard way to add language data. Use Context7 or WebSearch to fetch comprehensive stdlib/syntax/patterns data and store it in YAML format. Phase 1: scaffolds directory and returns instructions. Phase 2: accepts populated data and syncs to database.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        language: { type: 'string', description: "Programming language name (e.g., 'zig', 'rust', 'go')" },
        version: { type: 'string', description: "Language version (e.g., '0.16', '1.77')" },
        modules: { type: 'array', items: { type: 'string' }, description: 'Specific modules to fetch (optional, fetches all if omitted)' },
        force: { type: 'boolean', default: false, description: 'Re-fetch even if data already exists' },
        data: { type: 'object', description: 'Phase 2: populated YAML data to write (stdlib, syntax, conventions, patterns)' },
      },
      required: ['language'],
    },
    handler: async (args: { language: string; version?: string; modules?: string[]; force?: boolean; data?: Record<string, unknown> }) => {
      const lang = args.language.toLowerCase();
      const langDir = path.join(DATA_DIR, lang);
      const registryPath = path.join(DATA_DIR, 'index.yaml');

      // Phase 2: accept populated data and write files
      if (args.data) {
        return handlePhase2(lang, args.version || '0.0.0', langDir, registryPath, args.data, loader);
      }

      // Phase 1: check if exists, scaffold, return instructions
      return handlePhase1(lang, args.version, langDir, registryPath, args.force || false, args.modules);
    },
  };
}

function handlePhase1(
  lang: string,
  version: string | undefined,
  langDir: string,
  registryPath: string,
  force: boolean,
  modules?: string[],
) {
  const exists = fs.existsSync(langDir) && fs.existsSync(path.join(langDir, 'stdlib.yaml'));

  if (exists && !force) {
    return {
      content: [{
        type: 'text' as const,
        text: `Language "${lang}" already has stdlib data at ~/.code-writer/data/${lang}/. Use force: true to re-fetch.`,
      }],
    };
  }

  // Scaffold directory
  fs.mkdirSync(langDir, { recursive: true });
  const templateDir = path.resolve(__dirname, '../../data/_template');
  for (const file of TEMPLATE_FILES) {
    const src = path.join(templateDir, file);
    if (fs.existsSync(src)) {
      let content = fs.readFileSync(src, 'utf-8');
      content = content.replace(/\{\{LANGUAGE\}\}/g, lang);
      fs.writeFileSync(path.join(langDir, file), content);
    }
  }

  // Update registry
  let registry: Record<string, unknown> = { version: 1, languages: {} };
  if (fs.existsSync(registryPath)) {
    registry = yaml.load(fs.readFileSync(registryPath, 'utf-8')) as Record<string, unknown>;
  }
  const languages = registry.languages as Record<string, unknown>;
  languages[lang] = {
    name: lang.charAt(0).toUpperCase() + lang.slice(1),
    version: version || 'latest',
    extensions: [],
    aliases: [],
    dataDir: lang,
  };
  fs.writeFileSync(registryPath, yaml.dump(registry, { lineWidth: 120 }));

  const moduleHint = modules ? ` focusing on: ${modules.join(', ')}` : '';

  return {
    content: [{
      type: 'text' as const,
      text: [
        `Scaffolded language directory at ~/.code-writer/data/${lang}/.`,
        '',
        `**Next step:** Populate the YAML files with real data. Use these tools to fetch documentation:`,
        '',
        `1. **stdlib.yaml** - Fetch standard library APIs${moduleHint}:`,
        `   - Use Context7: resolve-library-id("${lang}") then query-docs for API reference`,
        `   - Or use WebSearch: "${lang} ${version || ''} standard library API reference"`,
        `   - Populate each module with methods, signatures, descriptions, and examples`,
        '',
        `2. **syntax.yaml** - Fetch language syntax guide:`,
        `   - Search: "${lang} syntax guide variables functions classes"`,
        '',
        `3. **conventions.yaml** - Fetch coding conventions:`,
        `   - Search: "${lang} coding conventions style guide best practices"`,
        '',
        `4. **patterns.yaml** - Fetch common patterns:`,
        `   - Search: "${lang} design patterns idioms"`,
        '',
        `5. **language.yaml** - Fill in metadata (name, version, paradigms, quickReference)`,
        '',
        `After populating, call lang_fetch again with the data parameter:`,
        `\`\`\``,
        `lang_fetch(language: "${lang}", data: { stdlib: {...}, syntax: {...}, conventions: {...}, patterns: {...} })`,
        `\`\`\``,
      ].join('\n'),
    }],
  };
}

async function handlePhase2(
  lang: string,
  version: string,
  langDir: string,
  registryPath: string,
  data: Record<string, unknown>,
  loader: LanguageLoader,
) {
  fs.mkdirSync(langDir, { recursive: true });

  const filesWritten: string[] = [];

  // Write each YAML file from data
  for (const key of ['stdlib', 'syntax', 'conventions', 'patterns']) {
    if (data[key]) {
      const filePath = path.join(langDir, `${key}.yaml`);
      fs.writeFileSync(filePath, yaml.dump(data[key], { lineWidth: 120 }));
      filesWritten.push(`${key}.yaml`);
    }
  }

  // Write language.yaml if provided
  if (data.language) {
    const filePath = path.join(langDir, 'language.yaml');
    fs.writeFileSync(filePath, yaml.dump(data.language, { lineWidth: 120 }));
    filesWritten.push('language.yaml');
  }

  // Update registry
  let registry: Record<string, unknown> = { version: 1, languages: {} };
  if (fs.existsSync(registryPath)) {
    registry = yaml.load(fs.readFileSync(registryPath, 'utf-8')) as Record<string, unknown>;
  }
  const languages = registry.languages as Record<string, unknown>;
  const meta = (data.language || {}) as Record<string, unknown>;
  languages[lang] = {
    name: meta.name || lang.charAt(0).toUpperCase() + lang.slice(1),
    version: meta.version || version,
    extensions: meta.fileExtensions || [],
    aliases: [],
    dataDir: lang,
  };
  fs.writeFileSync(registryPath, yaml.dump(registry, { lineWidth: 120 }));

  // Sync to database
  await loader.syncFromYaml();

  return {
    content: [{
      type: 'text' as const,
      text: [
        `Language "${lang}" data written and synced to database.`,
        '',
        `Files written: ${filesWritten.join(', ')}`,
        `Registry updated: ~/.code-writer/data/index.yaml`,
        '',
        `You can now use:`,
        `- \`lang_ref(language: "${lang}")\` for API reference`,
        `- \`lang_search(query: "...", language: "${lang}")\` to search`,
        `- \`lang_conventions(language: "${lang}")\` for coding conventions`,
      ].join('\n'),
    }],
  };
}
