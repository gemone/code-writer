import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../src/engine/database.js';
import { createDepFetchTool } from '../../src/tools/dep-fetch.js';

describe('dep_fetch tool', () => {
  let db: DatabaseManager;
  let tmpDir: string;
  let tool: ReturnType<typeof createDepFetchTool>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-writer-dep-fetch-'));
    db = new DatabaseManager(tmpDir);
    tool = createDepFetchTool(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should reject stdlib modules', async () => {
    const result = await tool.handler({ libraryName: 'fs', language: 'typescript' });
    expect(result.content[0].text).toContain('standard library');
  });

  it('Phase 1: should return instructions for unknown library', async () => {
    const result = await tool.handler({ libraryName: 'express', language: 'typescript', version: '^4.0.0' });
    expect(result.content[0].text).toContain('Context7');
    expect(result.content[0].text).toContain('resolve-library-id');
    expect(result.content[0].text).toContain('dep_fetch');
  });

  it('Phase 1: should return cached info for already-fetched library', async () => {
    db.insertDepRegistry({
      id: 'express@^4.0.0', libraryName: 'express', resolvedVersion: '4.18.2',
      versionRange: '^4.0.0', language: 'typescript',
    });
    db.insertDepVersionCache({
      libraryName: 'express', language: 'typescript',
      versionRange: '^4.0.0', resolvedVersion: '4.18.2', depId: 'express@^4.0.0',
    });

    const result = await tool.handler({ libraryName: 'express', language: 'typescript', version: '^4.0.0' });
    expect(result.content[0].text).toContain('already cached');
  });

  it('Phase 1: should return instructions when force=true even if cached', async () => {
    db.insertDepVersionCache({
      libraryName: 'express', language: 'typescript',
      versionRange: '^4.0.0', resolvedVersion: '4.18.2', depId: 'express@^4.0.0',
    });

    const result = await tool.handler({ libraryName: 'express', language: 'typescript', version: '^4.0.0', force: true });
    expect(result.content[0].text).toContain('Context7');
  });

  it('Phase 2: should store data and return summary', async () => {
    const result = await tool.handler({
      libraryName: 'react',
      language: 'typescript',
      version: '^18.0.0',
      data: {
        registry: { context7Id: '/facebook/react', description: 'UI library' },
        apis: [
          { module: 'hooks', exportName: 'useState', description: 'State hook', signature: 'useState<T>(initial: T): [T, Setter<T>]' },
        ],
        patterns: [
          { name: 'basic-state', category: 'usage', description: 'Simple state', codeExample: 'const [val, setVal] = useState(0)' },
        ],
        considerations: [
          { title: 'Rules of Hooks', category: 'tip', description: 'Only call hooks at top level', severity: 'warning' },
        ],
      },
    });

    expect(result.content[0].text).toContain('APIs: 1');
    expect(result.content[0].text).toContain('Patterns: 1');
    expect(result.content[0].text).toContain('Considerations: 1');

    // Verify data in DB
    const apis = db.getDepApis('react@^18.0.0');
    expect(apis).toHaveLength(1);
    expect(apis[0].export_name).toBe('useState');

    const patterns = db.getDepPatterns('react@^18.0.0');
    expect(patterns).toHaveLength(1);

    const considerations = db.getDepConsiderations('react@^18.0.0');
    expect(considerations).toHaveLength(1);

    const cached = db.findCachedDep('react', 'typescript', '^18.0.0');
    expect(cached).toBeDefined();
  });

  it('Phase 2: should work with minimal data', async () => {
    const result = await tool.handler({
      libraryName: 'lodash',
      language: 'typescript',
      version: '^4.0.0',
      data: {
        apis: [],
      },
    });

    expect(result.content[0].text).toContain('APIs: 0');
  });
});
