import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "node:fs"
import { extname, basename } from "node:path"
import { EXT_TO_LANG } from "../../src/shared/lang-map.js"

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
}

const IMPORT_PATTERNS = [
  /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /from\s+([\w.]+)\s+import/g,
]

function extractModules(content: string): string[] {
  const modules = new Set<string>()
  for (const pattern of IMPORT_PATTERNS) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      modules.add(match[1])
    }
  }
  return [...modules]
}

const CodeStandardsHooks: Plugin = async () => {
  return {
    // After a file is edited, inject relevant stdlib context
    "file.edited": async ({ event }) => {
      const filePath = event.path
      if (!filePath) return

      const ext = extname(filePath).toLowerCase()
      const lang = EXT_TO_LANG[ext]
      if (!lang) return

      // Read file content
      if (!existsSync(filePath)) return
      const content = readFileSync(filePath, 'utf-8')

      // Strip comments
      const stripped = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/#.*$/gm, '')

      const rawModules = extractModules(stripped)
      if (rawModules.length === 0) return

      const aliases = MODULE_ALIASES[lang] || {}
      const resolved = rawModules
        .map(m => aliases[m] || m)
        .filter(m => !m.startsWith('.') && !m.startsWith('/'))

      if (resolved.length === 0) return

      // Store detected modules for the session to use
      return {
        modules: resolved,
        language: lang,
        hint: `Detected ${lang} imports: ${resolved.join(', ')}. Use lang_ref(language: "${lang}", module: "<module>") for API details.`
      }
    },

    // Before tool execution, track language detection
    "tool.execute.before": async ({ input }) => {
      // Track file writes for project memory
      if (input?.tool === 'Write' || input?.tool === 'Edit') {
        const filePath = input?.file_path || input?.filePath
        if (!filePath) return

        const ext = extname(filePath).toLowerCase()
        const lang = EXT_TO_LANG[ext]
        if (!lang) return

        return {
          language: lang,
          file: basename(filePath),
        }
      }
    },
  }
}

export default CodeStandardsHooks
