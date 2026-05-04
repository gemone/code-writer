/**
 * Normalizes import paths to canonical module names for database lookup.
 * Maps Node.js prefixed imports (node:fs) and bare imports (fs) to a
 * single canonical name per module.
 */
export const MODULE_ALIASES: Record<string, Record<string, string>> = {
  typescript: {
    'node:fs': 'fs', 'node:fs/promises': 'fs', 'fs': 'fs',
    'node:path': 'path', 'path': 'path',
    'node:os': 'os', 'os': 'os',
    'node:crypto': 'crypto', 'crypto': 'crypto',
    'node:http': 'http', 'http': 'http',
    'node:url': 'url', 'url': 'url',
    'events': 'events', 'stream': 'stream',
    'child_process': 'child_process', 'util': 'util', 'buffer': 'buffer',
  },
  python: {
    'os.path': 'os', 'os': 'os', 'sys': 'sys', 'json': 'json',
    're': 're', 'pathlib': 'pathlib', 'datetime': 'datetime',
    'collections': 'collections', 'itertools': 'itertools',
    'functools': 'functools', 'typing': 'typing', 'abc': 'abc',
  },
};
