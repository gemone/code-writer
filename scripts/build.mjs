import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['better-sqlite3', '@modelcontextprotocol/sdk', '@ast-grep/napi', '@ast-grep/napi-*', '@ast-grep/lang-*'],
  sourcemap: true,
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ['src/mcp/server.ts'],
    outfile: 'dist/mcp/server.cjs',
  }),
  build({
    ...shared,
    entryPoints: ['src/hooks/language-detector.ts'],
    outfile: 'dist/hooks/language-detector.cjs',
  }),
  build({
    ...shared,
    entryPoints: ['src/hooks/conventions-lint.ts'],
    outfile: 'dist/hooks/conventions-lint.cjs',
  }),
  build({
    ...shared,
    entryPoints: ['src/hooks/project-memory.ts'],
    outfile: 'dist/hooks/project-memory.cjs',
  }),
  build({
    ...shared,
    entryPoints: ['src/hooks/api-detector.ts'],
    outfile: 'dist/hooks/api-detector.cjs',
  }),
]);

console.log('Build complete.');
