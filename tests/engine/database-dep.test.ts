import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../src/engine/database.js';

describe('DatabaseManager - Dependencies', () => {
  let db: DatabaseManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-writer-dep-test-'));
    db = new DatabaseManager(tmpDir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should insert and retrieve dep registry', () => {
    db.insertDepRegistry({
      id: 'express@4.18', libraryName: 'express', resolvedVersion: '4.18.2',
      language: 'typescript', packageManager: 'npm', description: 'Web framework',
    });
    const record = db.getDepRegistry('express@4.18');
    expect(record).toBeDefined();
    expect(record!.library_name).toBe('express');
    expect(record!.resolved_version).toBe('4.18.2');
  });

  it('should query registry by name with optional language filter', () => {
    db.insertDepRegistry({
      id: 'express@4', libraryName: 'express', resolvedVersion: '4.18.2',
      language: 'typescript',
    });
    db.insertDepRegistry({
      id: 'express@py', libraryName: 'express', resolvedVersion: '0.3',
      language: 'python',
    });

    const all = db.getDepRegistryByName('express');
    expect(all).toHaveLength(2);

    const tsOnly = db.getDepRegistryByName('express', 'typescript');
    expect(tsOnly).toHaveLength(1);
    expect(tsOnly[0].resolved_version).toBe('4.18.2');
  });

  it('should find dep registry by name+version+language', () => {
    db.insertDepRegistry({
      id: 'react@18', libraryName: 'react', resolvedVersion: '18.2.0',
      versionRange: '^18.0.0', language: 'typescript',
    });
    const found = db.findDepRegistry('react', '^18.0.0', 'typescript');
    expect(found).toBeDefined();
    expect(found!.resolved_version).toBe('18.2.0');

    const notFound = db.findDepRegistry('react', '^17.0.0', 'typescript');
    expect(notFound).toBeUndefined();
  });

  it('should update is_indexed flag', () => {
    db.insertDepRegistry({
      id: 'zod@3', libraryName: 'zod', resolvedVersion: '3.22.0',
      language: 'typescript',
    });
    expect((db.getDepRegistry('zod@3') as any).is_indexed).toBe(0);

    db.updateDepIndexed('zod@3', true);
    expect((db.getDepRegistry('zod@3') as any).is_indexed).toBe(1);
  });

  it('should cascade delete dep data from all tables', () => {
    db.insertDepRegistry({
      id: 'prisma@5', libraryName: 'prisma', resolvedVersion: '5.0.0',
      language: 'typescript',
    });
    db.insertDepApi({ depId: 'prisma@5', module: 'client', exportName: 'PrismaClient', description: 'DB client' });
    db.insertDepPattern({ depId: 'prisma@5', name: 'basic-query', description: 'Find first', codeExample: 'prisma.user.findFirst()' });
    db.insertDepConsideration({ depId: 'prisma@5', title: 'N+1', category: 'performance', description: 'Avoid N+1 queries' });

    db.deleteDepData('prisma@5');

    expect(db.getDepRegistry('prisma@5')).toBeUndefined();
    expect(db.getDepApis('prisma@5')).toHaveLength(0);
    expect(db.getDepPatterns('prisma@5')).toHaveLength(0);
    expect(db.getDepConsiderations('prisma@5')).toHaveLength(0);
  });

  it('should insert and query dep APIs with filters', () => {
    db.insertDepRegistry({
      id: 'react@18', libraryName: 'react', resolvedVersion: '18.2.0',
      language: 'typescript',
    });
    db.insertDepApi({ depId: 'react@18', module: 'hooks', exportName: 'useState', description: 'State hook' });
    db.insertDepApi({ depId: 'react@18', module: 'hooks', exportName: 'useEffect', description: 'Effect hook' });
    db.insertDepApi({ depId: 'react@18', module: 'components', exportName: 'Component', description: 'Base component' });

    const all = db.getDepApis('react@18');
    expect(all).toHaveLength(3);

    const hooks = db.getDepApis('react@18', 'hooks');
    expect(hooks).toHaveLength(2);

    const stateOnly = db.getDepApis('react@18', 'hooks', 'useState');
    expect(stateOnly).toHaveLength(1);
    expect(stateOnly[0].export_name).toBe('useState');
  });

  it('should insert and query dep patterns with category filter', () => {
    db.insertDepRegistry({
      id: 'next@14', libraryName: 'next.js', resolvedVersion: '14.0.0',
      language: 'typescript',
    });
    db.insertDepPattern({ depId: 'next@14', name: 'ssr-page', category: 'usage', description: 'SSR page', codeExample: 'export default function Page() {}' });
    db.insertDepPattern({ depId: 'next@14', name: 'api-route', category: 'setup', description: 'API route', codeExample: 'export async function GET() {}' });

    const all = db.getDepPatterns('next@14');
    expect(all).toHaveLength(2);

    const usage = db.getDepPatterns('next@14', 'usage');
    expect(usage).toHaveLength(1);
    expect(usage[0].name).toBe('ssr-page');
  });

  it('should insert and query dep considerations with filters', () => {
    db.insertDepRegistry({
      id: 'express@4', libraryName: 'express', resolvedVersion: '4.18.2',
      language: 'typescript',
    });
    db.insertDepConsideration({ depId: 'express@4', title: 'Helmet', category: 'security', description: 'Use helmet middleware', severity: 'warning' });
    db.insertDepConsideration({ depId: 'express@4', title: 'v4 Migration', category: 'migration', description: 'Migration from v3', severity: 'info' });

    const all = db.getDepConsiderations('express@4');
    expect(all).toHaveLength(2);

    const security = db.getDepConsiderations('express@4', 'security');
    expect(security).toHaveLength(1);

    const warnings = db.getDepConsiderations('express@4', undefined, 'warning');
    expect(warnings).toHaveLength(1);
  });

  it('should cache and find version cache entries', () => {
    db.insertDepVersionCache({
      libraryName: 'react', language: 'typescript',
      versionRange: '^18.0.0', resolvedVersion: '18.2.0', depId: 'react@18',
    });

    const cached = db.findCachedDep('react', 'typescript', '^18.0.0');
    expect(cached).toBeDefined();
    expect(cached!.dep_id).toBe('react@18');

    const miss = db.findCachedDep('react', 'typescript', '^17.0.0');
    expect(miss).toBeUndefined();
  });

  it('should search across dep tables with AND-then-OR fallback', () => {
    db.insertDepRegistry({
      id: 'axios@1', libraryName: 'axios', resolvedVersion: '1.6.0',
      language: 'typescript',
    });
    db.insertDepApi({ depId: 'axios@1', module: 'client', exportName: 'get', description: 'HTTP GET request' });
    db.insertDepConsideration({ depId: 'axios@1', title: 'CSRF', category: 'security', description: 'HTTP security considerations' });

    const results = db.searchDeps('HTTP request');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should filter dep search by language and library name', () => {
    db.insertDepRegistry({
      id: 'axios@1', libraryName: 'axios', resolvedVersion: '1.6.0',
      language: 'typescript',
    });
    db.insertDepApi({ depId: 'axios@1', module: 'client', exportName: 'get', description: 'GET request' });

    db.insertDepRegistry({
      id: 'requests@2', libraryName: 'requests', resolvedVersion: '2.31.0',
      language: 'python',
    });
    db.insertDepApi({ depId: 'requests@2', module: 'api', exportName: 'get', description: 'GET request' });

    const tsOnly = db.searchDeps('GET request', 'typescript');
    expect(tsOnly.every((r: any) => r.language === 'typescript')).toBe(true);

    const axiosOnly = db.searchDeps('GET request', undefined, 'axios');
    expect(axiosOnly.every((r: any) => r.library_name === 'axios')).toBe(true);
  });
});
