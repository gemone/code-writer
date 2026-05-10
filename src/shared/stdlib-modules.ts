const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'url/',
  'stream', 'buffer', 'events', 'util', 'child_process', 'net',
  'tls', 'dns', 'querystring', 'assert', 'zlib', 'readline',
  'vm', 'worker_threads', 'cluster', 'dgram', 'perf_hooks',
  'string_decoder', 'timers', 'timers/promises', 'fs/promises',
  'stream/promises', 'stream/consumers', 'dns/promises',
  'fs/promises', 'node:fs', 'node:path', 'node:os', 'node:crypto',
  'node:http', 'node:https', 'node:url', 'node:stream', 'node:buffer',
  'node:events', 'node:util', 'node:child_process', 'node:net',
  'node:tls', 'node:dns', 'node:assert', 'node:zlib', 'node:readline',
  'node:vm', 'node:worker_threads', 'node:fs/promises',
]);

const PYTHON_STDLIB = new Set([
  'os', 'sys', 'json', 're', 'math', 'datetime', 'collections',
  'itertools', 'functools', 'pathlib', 'typing', 'dataclasses',
  'abc', 'argparse', 'logging', 'unittest', 'io', 'hashlib',
  'socket', 'http', 'urllib', 'email', 'html', 'xml', 'csv',
  'sqlite3', 'threading', 'multiprocessing', 'subprocess',
  'asyncio', 'contextlib', 'copy', 'enum', 'decimal', 'fractions',
  'random', 'statistics', 'time', 'calendar', 'struct', 'codecs',
  'tempfile', 'shutil', 'glob', 'fnmatch', 'linecache', 'pickle',
  'shelve', 'marshal', 'base64', 'binascii', 'pprint', 'textwrap',
  'string', 'difflib', 'uuid', 'types', 'weakref', 'operator',
  'inspect', 'ast', 'dis', 'gc', 'platform', 'ctypes', 'signal',
  'mmap', 'ssl', 'select', 'selectors', 'queue', 'heapq', 'bisect',
  'array', 'sched', 'traceback', 'warnings',
  'concurrent', 'concurrent.futures', 'importlib', 'pkgutil',
  'zoneinfo', 'tomllib', 'graphlib',
]);

const GO_STDLIB = new Set([
  'fmt', 'os', 'io', 'strings', 'strconv', 'bufio', 'bytes',
  'errors', 'log', 'path', 'filepath', 'encoding/json', 'encoding/xml',
  'encoding/csv', 'net/http', 'net/url', 'net', 'time', 'math',
  'math/rand', 'crypto', 'crypto/sha256', 'crypto/md5',
  'context', 'sync', 'testing', 'html/template', 'text/template',
  'regexp', 'sort', 'container/heap', 'container/list', 'container/ring',
  'database/sql', 'runtime', 'reflect', 'unsafe', 'syscall',
  'archive/zip', 'archive/tar', 'compress/gzip', 'compress/zlib',
  'debug', 'embed', 'flag', 'go', 'hash', 'index', 'mime',
  'runtime/debug', 'runtime/pprof', 'unicode', 'unicode/utf8',
  'unicode/utf16', 'os/exec', 'os/signal', 'os/user',
]);

const RUST_STDLIB_CRATES = new Set([
  'std', 'core', 'alloc', 'proc_macro', 'test',
]);

const STDLIB_SETS: Record<string, Set<string>> = {
  typescript: NODE_BUILTINS,
  javascript: NODE_BUILTINS,
  ts: NODE_BUILTINS,
  js: NODE_BUILTINS,
  tsx: NODE_BUILTINS,
  jsx: NODE_BUILTINS,
  python: PYTHON_STDLIB,
  py: PYTHON_STDLIB,
  go: GO_STDLIB,
  rust: RUST_STDLIB_CRATES,
  rs: RUST_STDLIB_CRATES,
};

export function isStdlibModule(moduleName: string, language: string): boolean {
  const stdlib = STDLIB_SETS[language.toLowerCase()];
  if (!stdlib) return false;

  if (stdlib.has(moduleName)) return true;

  // For scoped/paths: check the root (e.g., "fs/promises" → "fs")
  const root = moduleName.split('/')[0];
  return stdlib.has(root);
}
