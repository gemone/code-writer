import { describe, it, expect } from 'vitest';
import { createLangAstTool } from '../../src/tools/lang-ast.js';

describe('lang_ast tool', () => {
  const tool = createLangAstTool();

  async function call(args: Record<string, unknown>) {
    return tool.handler(args as any);
  }

  it('queries patterns', async () => {
    const result = await call({
      language: 'javascript',
      operation: 'query',
      code: 'console.log("hello");',
      pattern: 'console.log($A)',
    });
    expect(result.content[0].text).toContain('hello');
    expect(result.isError).toBeFalsy();
  });

  it('query returns no matches message', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'query',
      code: 'const x = 1;',
      pattern: 'console.log($A)',
    });
    expect(result.content[0].text).toContain('No matches found');
  });

  it('query requires pattern', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'query',
      code: 'const x = 1;',
    });
    expect(result.content[0].text).toContain('Pattern is required');
    expect(result.isError).toBe(true);
  });

  it('replaces patterns', async () => {
    const result = await call({
      language: 'javascript',
      operation: 'replace',
      code: 'console.log("hello");',
      pattern: 'console.log($A)',
      replacement: 'console.info($A)',
    });
    expect(result.content[0].text).toContain('console.info("hello")');
    expect(result.isError).toBeFalsy();
  });

  it('replace requires both pattern and replacement', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'replace',
      code: 'const x = 1;',
      pattern: 'console.log($A)',
    });
    expect(result.content[0].text).toContain('Both pattern and replacement');
    expect(result.isError).toBe(true);
  });

  it('lints with pattern rules', async () => {
    const result = await call({
      language: 'javascript',
      operation: 'lint',
      code: 'console.log("hello");',
      rules: [{ kind: 'pattern', value: 'console.log($A)', message: 'Use logger', severity: 'warn' }],
    });
    expect(result.content[0].text).toContain('Use logger');
    expect(result.isError).toBeFalsy();
  });

  it('lint reports clean code', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'lint',
      code: 'const x = 1;',
      rules: [{ kind: 'pattern', value: 'console.log($A)', message: 'No console', severity: 'warn' }],
    });
    expect(result.content[0].text).toContain('No violations');
  });

  it('lint requires rules', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'lint',
      code: 'const x = 1;',
    });
    expect(result.content[0].text).toContain('Rules are required');
    expect(result.isError).toBe(true);
  });

  it('extracts imports', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'extract',
      code: 'import { foo } from "bar";',
      target: 'imports',
    });
    expect(result.content[0].text).toContain('foo');
    expect(result.content[0].text).toContain('bar');
  });

  it('extracts functions', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'extract',
      code: 'function foo() {}',
      target: 'functions',
    });
    expect(result.content[0].text).toContain('foo');
  });

  it('extract requires target', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'extract',
      code: 'const x = 1;',
    });
    expect(result.content[0].text).toContain('Target is required');
    expect(result.isError).toBe(true);
  });

  it('returns error for unsupported language', async () => {
    const result = await call({
      language: 'brainfuck',
      operation: 'query',
      code: '++',
      pattern: '$X',
    });
    expect(result.content[0].text).toContain('not supported');
    expect(result.isError).toBe(true);
  });

  it('returns error for unknown operation', async () => {
    const result = await call({
      language: 'typescript',
      operation: 'unknown',
      code: 'const x = 1;',
    });
    expect(result.content[0].text).toContain('Unknown operation');
    expect(result.isError).toBe(true);
  });
});
