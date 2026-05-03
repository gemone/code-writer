import fs from 'node:fs';
import path from 'node:path';
import { DatabaseManager } from '../engine/database.js';

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.py': 'python', '.pyi': 'python', '.pyw': 'python',
  '.rs': 'rust', '.go': 'go', '.java': 'java', '.rb': 'ruby',
};

const MODULE_ALIASES: Record<string, Record<string, string>> = {
  typescript: {
    'node:fs': 'fs', 'node:path': 'path', 'node:os': 'os',
    'node:crypto': 'crypto', 'node:http': 'http', 'node:url': 'url',
    'fs': 'fs', 'path': 'path', 'os': 'os', 'crypto': 'crypto',
    'http': 'http', 'url': 'url', 'events': 'events', 'stream': 'stream',
    'child_process': 'child_process', 'util': 'util', 'buffer': 'buffer',
  },
  python: {
    'os.path': 'os', 'os': 'os', 'sys': 'sys', 'json': 'json',
    're': 're', 'pathlib': 'pathlib', 'datetime': 'datetime',
    'collections': 'collections', 'itertools': 'itertools',
    'functools': 'functools', 'typing': 'typing', 'abc': 'abc',
  },
};

const IMPORT_PATTERNS = [
  /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /from\s+([\w.]+)\s+import/g,
];

interface HookInput {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    content?: string;
  };
}

function extractModules(content: string): string[] {
  const modules = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      modules.add(match[1]);
    }
  }
  return [...modules];
}

const input = fs.readFileSync(0, 'utf-8');
try {
  const data: HookInput = JSON.parse(input);
  const filePath = data.tool_input?.file_path;
  if (!filePath) { process.exit(0); }

  const ext = path.extname(filePath).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (!lang) { process.exit(0); }

  let content = data.tool_input?.content;
  if (!content && fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }
  if (!content) { process.exit(0); }

  // Strip comments to avoid false positives
  const stripped = content
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#.*$/gm, '');

  const rawModules = extractModules(stripped);
  if (rawModules.length === 0) { process.exit(0); }

  const aliases = MODULE_ALIASES[lang] || {};
  const resolvedModules = rawModules
    .map(m => aliases[m] || m)
    .filter(m => !m.startsWith('.') && !m.startsWith('/'));

  if (resolvedModules.length === 0) { process.exit(0); }

  const db = new DatabaseManager();
  const entries: { module: string; method: string; signature: string; description: string; example?: string }[] = [];

  for (const mod of resolvedModules) {
    const methods = db.getStdlibMethods(lang, mod);
    for (const m of methods.slice(0, 3)) {
      entries.push({
        module: mod,
        method: m.method as string,
        signature: (m.signature || '') as string,
        description: (m.description || '') as string,
        example: m.example as string | undefined,
      });
    }
  }
  db.close();

  if (entries.length === 0) { process.exit(0); }

  let reminder = `<system-reminder>\nDetected API usage in ${path.basename(filePath)}. Relevant stdlib reference:\n\n`;
  for (const e of entries.slice(0, 5)) {
    reminder += `**${e.module}.${e.method}**\n`;
    if (e.signature) reminder += `\`${e.signature}\`\n`;
    reminder += `${e.description}\n`;
    if (e.example) {
      const short = e.example.split('\n').slice(0, 5).join('\n');
      reminder += `\`\`\`\n${short}\n\`\`\`\n`;
    }
    reminder += '\n';
  }
  reminder += `Use \`lang_ref(language: "${lang}", module: "<module>")\` for more details.\n</system-reminder>`;
  process.stdout.write(reminder);
} catch {
  // Silent failure
}
process.exit(0);
