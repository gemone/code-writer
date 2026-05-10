import { describe, it, expect } from 'vitest';
import {
  parseCode,
  findPattern,
  replacePattern,
  extractImports,
  extractElements,
  lintCode,
  getMetavariables,
  isSupported,
  resolveLang,
} from '../../src/engine/ast.js';

describe('AST Engine', () => {
  describe('resolveLang + isSupported', () => {
    it('resolves typescript and aliases', () => {
      expect(resolveLang('typescript')).toBe('typescript');
      expect(resolveLang('ts')).toBe('typescript');
    });

    it('resolves all supported languages', () => {
      for (const lang of ['javascript', 'python', 'rust', 'go', 'java', 'ruby', 'c', 'cpp', 'bash']) {
        expect(resolveLang(lang)).toBe(lang);
      }
    });

    it('returns undefined for unknown', () => {
      expect(resolveLang('unknown')).toBeUndefined();
      expect(isSupported('unknown')).toBe(false);
    });
  });

  describe('parseCode', () => {
    it('parses TypeScript', () => {
      const root = parseCode('typescript', 'const x: number = 1;');
      expect(root.root().text()).toContain('const x');
    });

    it('parses Python', () => {
      const root = parseCode('python', 'def foo(): pass');
      expect(root.root().text()).toContain('def foo');
    });

    it('parses Rust', () => {
      const root = parseCode('rust', 'fn main() {}');
      expect(root.root().text()).toContain('fn main');
    });

    it('parses Go', () => {
      const root = parseCode('go', 'func main() {}');
      expect(root.root().text()).toContain('func main');
    });

    it('parses Java', () => {
      const root = parseCode('java', 'class Foo { void bar() {} }');
      expect(root.root().text()).toContain('class Foo');
    });

    it('throws for unsupported language', () => {
      expect(() => parseCode('brainfuck', '++')).toThrow('Unsupported language');
    });
  });

  describe('findPattern', () => {
    it('finds console.log calls in JS', () => {
      const root = parseCode('javascript', 'console.log("hello");');
      const matches = findPattern(root, 'console.log($A)');
      expect(matches).toHaveLength(1);
      expect(matches[0].matches.A).toBe('"hello"');
    });

    it('finds function definitions in Python', () => {
      const root = parseCode('python', 'def greet(name):\n    pass');
      const matches = findPattern(root, 'def $NAME($PARAMS):\n    $$$BODY');
      expect(matches).toHaveLength(1);
      expect(matches[0].matches.NAME).toBe('greet');
    });

    it('finds multiple matches', () => {
      const root = parseCode('typescript', 'a.b();\nc.d();');
      const matches = findPattern(root, '$X.$Y()');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array for no matches', () => {
      const root = parseCode('typescript', 'const x = 1;');
      const matches = findPattern(root, 'console.log($A)');
      expect(matches).toHaveLength(0);
    });
  });

  describe('replacePattern', () => {
    it('replaces with metavariables', () => {
      const root = parseCode('javascript', 'console.log("hello");');
      const result = replacePattern(root, 'console.log($A)', 'console.info($A)');
      expect(result).toBe('console.info("hello");');
    });

    it('replaces multiple occurrences', () => {
      const root = parseCode('javascript', 'console.log("a");\nconsole.log("b");');
      const result = replacePattern(root, 'console.log($A)', 'console.info($A)');
      expect(result).toContain('console.info("a")');
      expect(result).toContain('console.info("b")');
    });

    it('returns original when no match', () => {
      const source = 'const x = 1;';
      const root = parseCode('typescript', source);
      const result = replacePattern(root, 'console.log($A)', 'console.info($A)');
      expect(result).toBe(source);
    });
  });

  describe('extractImports', () => {
    it('extracts TS named imports', () => {
      const imports = extractImports('typescript', 'import { foo, bar } from "module";');
      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe('module');
      expect(imports[0].names).toContain('foo');
      expect(imports[0].names).toContain('bar');
    });

    it('extracts TS default import', () => {
      const imports = extractImports('typescript', 'import React from "react";');
      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe('react');
      expect(imports[0].names).toContain('React');
    });

    it('extracts TS type import', () => {
      const imports = extractImports('typescript', 'import type { Config } from "types";');
      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe('types');
      expect(imports[0].names).toContain('Config');
    });

    it('extracts Python import statement', () => {
      const imports = extractImports('python', 'import os\nimport json');
      expect(imports).toHaveLength(2);
      expect(imports[0].module).toBe('os');
      expect(imports[1].module).toBe('json');
    });

    it('extracts Python from-import', () => {
      const imports = extractImports('python', 'from pathlib import Path');
      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe('pathlib');
      expect(imports[0].names).toContain('Path');
    });

    it('extracts Python star import', () => {
      const imports = extractImports('python', 'from os import *');
      expect(imports).toHaveLength(1);
      expect(imports[0].names).toEqual(['*']);
    });

    it('extracts Go imports', () => {
      const imports = extractImports('go', 'import "fmt"\nimport "os"');
      expect(imports).toHaveLength(2);
      expect(imports[0].module).toBe('fmt');
      expect(imports[1].module).toBe('os');
    });

    it('extracts Java imports', () => {
      const imports = extractImports('java', 'import java.util.List;\nimport static org.junit.Assert.*;');
      expect(imports).toHaveLength(2);
      expect(imports[0].module).toBe('java.util.List');
      expect(imports[1].module).toBe('org.junit.Assert.*');
    });

    it('extracts Rust use declarations', () => {
      const imports = extractImports('rust', 'use std::io;\nuse serde::Serialize;');
      expect(imports).toHaveLength(2);
      expect(imports[0].module).toBe('std::io');
      expect(imports[1].module).toBe('serde::Serialize');
    });

    it('extracts Ruby require', () => {
      const imports = extractImports('ruby', 'require "json"\nrequire_relative "helper"');
      expect(imports).toHaveLength(2);
      expect(imports[0].module).toBe('json');
      expect(imports[1].module).toBe('helper');
    });

    it('extracts C includes', () => {
      const imports = extractImports('c', '#include <stdio.h>\n#include "mylib.h"');
      expect(imports).toHaveLength(2);
      expect(imports[0].module).toBe('stdio.h');
      expect(imports[1].module).toBe('mylib.h');
    });

    it('returns empty for unsupported', () => {
      expect(extractImports('unknown', 'import x')).toEqual([]);
    });
  });

  describe('extractElements', () => {
    it('extracts TS functions', () => {
      const results = extractElements('typescript', 'function foo() {}\nfunction bar() {}', 'functions');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('foo');
      expect(results[1].name).toBe('bar');
    });

    it('extracts TS classes', () => {
      const results = extractElements('typescript', 'class Foo {}', 'classes');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Foo');
    });

    it('extracts TS interfaces', () => {
      const results = extractElements('typescript', 'interface Foo { x: number; }', 'interfaces');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Foo');
    });

    it('extracts TS types', () => {
      const results = extractElements('typescript', 'type Foo = string;', 'types');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Foo');
    });

    it('extracts Python functions', () => {
      const results = extractElements('python', 'def foo():\n    pass\ndef bar():\n    pass', 'functions');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('foo');
    });

    it('extracts Python classes', () => {
      const results = extractElements('python', 'class Foo:\n    pass', 'classes');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Foo');
    });

    it('extracts Rust functions', () => {
      const results = extractElements('rust', 'fn foo() {}', 'functions');
      expect(results).toHaveLength(1);
    });

    it('extracts Rust structs', () => {
      const results = extractElements('rust', 'struct Foo { x: i32 }', 'structs');
      expect(results).toHaveLength(1);
    });

    it('extracts Go functions', () => {
      const results = extractElements('go', 'func main() {}\nfunc foo() {}', 'functions');
      expect(results).toHaveLength(2);
    });

    it('extracts Java methods', () => {
      const results = extractElements('java', 'class Foo { void bar() {} }', 'functions');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('bar');
    });

    it('extracts Java classes', () => {
      const results = extractElements('java', 'class Foo {}', 'classes');
      expect(results).toHaveLength(1);
    });

    it('extracts Ruby methods', () => {
      const results = extractElements('ruby', 'def foo\nend', 'functions');
      expect(results).toHaveLength(1);
    });

    it('extracts Ruby classes', () => {
      const results = extractElements('ruby', 'class Foo\nend', 'classes');
      expect(results).toHaveLength(1);
    });

    it('extracts C functions', () => {
      const results = extractElements('c', 'int foo() { return 0; }', 'functions');
      expect(results).toHaveLength(1);
    });

    it('extracts C++ functions', () => {
      const results = extractElements('cpp', 'int foo() { return 0; }', 'functions');
      expect(results).toHaveLength(1);
    });

    it('extracts C++ classes', () => {
      const results = extractElements('cpp', 'class Foo { };', 'classes');
      expect(results).toHaveLength(1);
    });

    it('extracts Bash functions', () => {
      const results = extractElements('bash', 'foo() {\n  echo hi\n}', 'functions');
      expect(results).toHaveLength(1);
    });

    it('returns empty for unknown target', () => {
      const results = extractElements('typescript', 'const x = 1;', 'unknown_target');
      expect(results).toHaveLength(0);
    });
  });

  describe('lintCode', () => {
    it('catches pattern-based violations', () => {
      const results = lintCode('javascript', 'console.log("hello");', [
        { kind: 'pattern', value: 'console.log($A)', message: 'Use logger instead', severity: 'warn' },
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('warn');
      expect(results[0].line).toBe(0);
    });

    it('catches kind-based violations', () => {
      const results = lintCode('typescript', 'debugger;', [
        { kind: 'kind', value: 'debugger_statement', message: 'Remove debugger', severity: 'error' },
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('error');
    });

    it('deduplicates by line+message', () => {
      const source = 'console.log("a");\nconsole.log("b");';
      const results = lintCode('javascript', source, [
        { kind: 'pattern', value: 'console.log($A)', message: 'No console.log', severity: 'warn' },
      ]);
      // Two matches, same message but different lines — both should be kept
      expect(results).toHaveLength(2);
    });

    it('returns empty for no violations', () => {
      const results = lintCode('typescript', 'const x = 1;', [
        { kind: 'pattern', value: 'console.log($A)', message: 'No console.log', severity: 'warn' },
      ]);
      expect(results).toHaveLength(0);
    });
  });

  describe('getMetavariables', () => {
    it('extracts single metavariable', () => {
      const root = parseCode('javascript', 'console.log("hello");');
      const matches = findPattern(root, 'console.log($A)');
      expect(matches).toHaveLength(1);
      expect(matches[0].matches.A).toBe('"hello"');
    });

    it('extracts multiple metavariables', () => {
      const root = parseCode('typescript', 'const x: number = 42;');
      const matches = findPattern(root, 'const $NAME: $TYPE = $VALUE');
      expect(matches).toHaveLength(1);
      expect(matches[0].matches.NAME).toBe('x');
      expect(matches[0].matches.TYPE).toBe('number');
      expect(matches[0].matches.VALUE).toBe('42');
    });
  });
});
