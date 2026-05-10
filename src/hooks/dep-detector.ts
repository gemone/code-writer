import fs from 'node:fs';
import path from 'node:path';
import { DatabaseManager } from '../engine/database.js';
import { extractImports, isSupported } from '../engine/ast.js';
import { EXT_TO_LANG } from '../shared/lang-map.js';
import { MODULE_ALIASES } from '../shared/module-aliases.js';
import { isStdlibModule } from '../shared/stdlib-modules.js';
import { resolveDepAlias } from '../shared/dep-aliases.js';

interface HookInput {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    content?: string;
  };
}

const input = fs.readFileSync(0, 'utf-8');
try {
  const data: HookInput = JSON.parse(input);
  const filePath = data.tool_input?.file_path;
  if (!filePath) { process.exit(0); }

  const ext = path.extname(filePath).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (!lang || !isSupported(lang)) { process.exit(0); }

  let content = data.tool_input?.content;
  if (!content && fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }
  if (!content) { process.exit(0); }

  const imports = extractImports(lang, content);
  if (imports.length === 0) { process.exit(0); }

  const aliases = MODULE_ALIASES[lang] || {};
  const rawModules = imports.map(i => i.module);
  const thirdParty = rawModules
    .map(m => aliases[m] || m)
    .filter(m => !m.startsWith('.') && !m.startsWith('/') && !isStdlibModule(m, lang));

  if (thirdParty.length === 0) { process.exit(0); }

  const db = new DatabaseManager();
  const canonicals = thirdParty.map(m => resolveDepAlias(m));
  const known = db.getDepRegistriesByNames(canonicals, lang);
  const cached: string[] = [];
  const uncached: string[] = [];

  for (const canonical of canonicals) {
    if (known.has(canonical)) {
      cached.push(canonical);
    } else {
      uncached.push(canonical);
    }
  }
  db.close();

  if (cached.length === 0 && uncached.length === 0) { process.exit(0); }

  let reminder = `<system-reminder>\nDetected third-party imports in ${path.basename(filePath)}:\n\n`;

  if (cached.length > 0) {
    reminder += `**Cached deps:** ${cached.join(', ')}\n`;
    reminder += `Use \`dep_explore(libraryName: "<name>")\` to view APIs, patterns, and considerations.\n\n`;
  }

  if (uncached.length > 0) {
    reminder += `**Uncached deps:** ${uncached.join(', ')}\n`;
    reminder += `Use \`dep_fetch(libraryName: "<name>", language: "${lang}")\` to fetch and cache library data.\n\n`;
  }

  reminder += `</system-reminder>`;
  process.stdout.write(reminder);
} catch {
  // Silent failure
}
process.exit(0);
