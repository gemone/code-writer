import { describe, it, expect } from 'vitest';
import { createLangLspTool } from '../../src/tools/lang-lsp.js';
import { LspClientManager } from '../../src/engine/lsp-client.js';

function createMockManager() {
  const mockClient = {
    hover: async () => ({
      contents: '(property) foo: string',
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } },
    }),
    definition: async () => [
      { uri: 'file:///src/foo.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
    ],
    references: async () => [
      { uri: 'file:///src/foo.ts', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } } },
      { uri: 'file:///src/bar.ts', range: { start: { line: 5, character: 2 }, end: { line: 5, character: 5 } } },
    ],
    diagnostics: async () => [
      { severity: 'error', message: "Cannot find name 'x'", line: 2, character: 0, endLine: 2, endCharacter: 1, source: 'ts' },
    ],
    documentSymbols: async () => [
      { name: 'MyClass', kind: 5, range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } } },
    ],
  };

  return {
    getClient: async () => mockClient,
    shutdownAll: async () => {},
  } as unknown as LspClientManager;
}

describe('lang_lsp tool', () => {
  const manager = createMockManager();
  const tool = createLangLspTool(manager);

  async function call(args: Record<string, unknown>) {
    return tool.handler(args as any);
  }

  it('returns hover info', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'hover',
      filePath: '/src/foo.ts',
      line: 1,
      character: 7,
    });
    expect(result.content[0].text).toContain('foo: string');
    expect(result.isError).toBeFalsy();
  });

  it('returns definition locations', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'definition',
      filePath: '/src/foo.ts',
      line: 1,
      character: 7,
    });
    expect(result.content[0].text).toContain('Definitions');
    expect(result.content[0].text).toContain('/src/foo.ts');
    expect(result.isError).toBeFalsy();
  });

  it('returns references', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'references',
      filePath: '/src/foo.ts',
      line: 1,
      character: 7,
    });
    expect(result.content[0].text).toContain('References');
    expect(result.content[0].text).toContain('**Found:** 2');
    expect(result.isError).toBeFalsy();
  });

  it('returns diagnostics', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'diagnostics',
      filePath: '/src/foo.ts',
    });
    expect(result.content[0].text).toContain("Cannot find name 'x'");
    expect(result.isError).toBeFalsy();
  });

  it('returns document symbols', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'documentSymbol',
      filePath: '/src/foo.ts',
    });
    expect(result.content[0].text).toContain('MyClass');
    expect(result.isError).toBeFalsy();
  });

  it('returns error for unknown operation', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'unknown',
      filePath: '/src/foo.ts',
    });
    expect(result.content[0].text).toContain('Unknown operation');
    expect(result.isError).toBe(true);
  });

  it('returns error when line/character missing for hover', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'hover',
      filePath: '/src/foo.ts',
    });
    expect(result.content[0].text).toContain('line and character are required');
    expect(result.isError).toBe(true);
  });

  it('returns error when line/character missing for definition', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'definition',
      filePath: '/src/foo.ts',
    });
    expect(result.content[0].text).toContain('line and character are required');
    expect(result.isError).toBe(true);
  });

  it('returns error when line/character missing for references', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'references',
      filePath: '/src/foo.ts',
    });
    expect(result.content[0].text).toContain('line and character are required');
    expect(result.isError).toBe(true);
  });

  it('handles LSP server error gracefully', async () => {
    const errorManager = {
      getClient: async () => { throw new Error('Server not found'); },
      shutdownAll: async () => {},
    } as unknown as LspClientManager;
    const errorTool = createLangLspTool(errorManager);

    const result = await errorTool.handler({
      language: 'typescript',
      operation: 'hover',
      filePath: '/src/foo.ts',
      line: 1,
      character: 1,
    } as any);
    expect(result.content[0].text).toContain('LSP error');
    expect(result.content[0].text).toContain('Server not found');
    expect(result.isError).toBe(true);
  });
});
