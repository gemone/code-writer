import sg from '@ast-grep/napi';
import { createRequire } from 'node:module';

try {
  const require = createRequire(import.meta.url);
  sg.registerDynamicLanguage({
    python: require('@ast-grep/lang-python'),
    rust: require('@ast-grep/lang-rust'),
    go: require('@ast-grep/lang-go'),
    java: require('@ast-grep/lang-java'),
    ruby: require('@ast-grep/lang-ruby'),
    c: require('@ast-grep/lang-c'),
    cpp: require('@ast-grep/lang-cpp'),
    bash: require('@ast-grep/lang-bash'),
  });
} catch {
  // Languages already registered or packages not installed
}

// Map our language names to ast-grep identifiers
const LANG_MAP: Record<string, string> = {
  typescript: 'typescript', ts: 'typescript',
  javascript: 'javascript', js: 'javascript',
  tsx: 'tsx', jsx: 'tsx',
  python: 'python', py: 'python',
  rust: 'rust', rs: 'rust',
  go: 'go',
  java: 'java',
  ruby: 'ruby', rb: 'ruby',
  c: 'c',
  cpp: 'cpp', 'c++': 'cpp', cxx: 'cpp',
  bash: 'bash', sh: 'bash',
};

export function resolveLang(lang: string): string | undefined {
  return LANG_MAP[lang.toLowerCase()];
}

export function isSupported(lang: string): boolean {
  return resolveLang(lang) !== undefined;
}

// --- Types ---

export interface ImportInfo {
  module: string;
  names: string[];  // imported names, empty for bare imports
  line: number;
  raw: string;
}

export interface MatchResult {
  text: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  matches: Record<string, string>;
}

export interface AstRule {
  kind: string;       // 'pattern' | 'kind'
  value: string;      // pattern string or kind name
  message: string;
  severity: 'error' | 'warn' | 'info';
}

export interface LintResult {
  message: string;
  severity: 'error' | 'warn' | 'info';
  line: number;
  column: number;
  text: string;
}

export interface ExtractResult {
  kind: string;
  name: string;
  text: string;
  line: number;
  endLine: number;
}

// --- Core ---

export function parseCode(lang: string, source: string): sg.SgRoot {
  const resolved = resolveLang(lang);
  if (!resolved) throw new Error(`Unsupported language: ${lang}`);
  return sg.parse(resolved, source);
}

export function findPattern(root: sg.SgRoot, pattern: string): MatchResult[] {
  const rootNode = root.root();
  const nodes = rootNode.findAll({ rule: { pattern } });
  if (!nodes) return [];
  return nodes.map(n => nodeToMatch(n, pattern));
}

export function findAllKind(root: sg.SgRoot, kindName: string): MatchResult[] {
  const rootNode = root.root();
  const nodes = rootNode.findAll({ rule: { kind: kindName } });
  if (!nodes) return [];
  return nodes.map(n => nodeToMatch(n));
}

export function replacePattern(root: sg.SgRoot, pattern: string, replacement: string): string {
  const rootNode = root.root();
  const nodes = rootNode.findAll({ rule: { pattern } });
  if (!nodes || nodes.length === 0) return rootNode.text();

  const varNames = [...new Set(replacement.match(/\$[A-Z_]+/g) || [])];
  const edits: sg.Edit[] = [];
  for (const node of nodes) {
    let replaced = replacement;
    for (const varName of varNames) {
      const name = varName.slice(1);
      const matched = node.getMatch(name);
      if (matched) {
        replaced = replaced.replaceAll(varName, matched.text());
      }
    }
    edits.push(node.replace(replaced));
  }
  return rootNode.commitEdits(edits);
}

// --- Import Extraction ---

const TS_IMPORT_PATTERN = /import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/;
const TS_NAMED_IMPORTS = /\{([^}]+)\}/;

export function extractImports(lang: string, source: string): ImportInfo[] {
  const resolved = resolveLang(lang);
  if (!resolved) return [];

  const root = sg.parse(resolved, source);
  const rootNode = root.root();
  const imports: ImportInfo[] = [];

  if (resolved === 'typescript' || resolved === 'tsx' || resolved === 'javascript') {
    // Find import_statement nodes
    const importNodes = rootNode.findAll({ rule: { kind: 'import_statement' } }) || [];
    for (const node of importNodes) {
      const text = node.text();
      const match = TS_IMPORT_PATTERN.exec(text);
      if (!match) continue;

      const module = match[1];
      const names: string[] = [];

      // Extract named imports: { a, b, c }
      const namedMatch = TS_NAMED_IMPORTS.exec(text);
      if (namedMatch) {
        names.push(...namedMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()));
      } else if (!text.includes('{') && !text.includes('*')) {
        // Default import: import X from '...'
        const defaultMatch = text.match(/import\s+(\w+)\s+from/);
        if (defaultMatch) names.push(defaultMatch[1]);
      }

      imports.push({
        module,
        names,
        line: node.range().start.line,
        raw: text,
      });
    }
  } else if (resolved === 'python') {
    // import_statement: import os, import json
    const importNodes = rootNode.findAll({ rule: { kind: 'import_statement' } }) || [];
    for (const node of importNodes) {
      const text = node.text();
      // "import os" or "import os, json"
      const modules = text.replace(/^import\s+/, '').split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
      for (const mod of modules) {
        imports.push({
          module: mod,
          names: [],
          line: node.range().start.line,
          raw: text,
        });
      }
    }

    // import_from_statement: from pathlib import Path
    const fromNodes = rootNode.findAll({ rule: { kind: 'import_from_statement' } }) || [];
    for (const node of fromNodes) {
      const text = node.text();
      const match = text.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
      if (!match) continue;

      const module = match[1];
      const namesPart = match[2];
      const names = namesPart === '*'
        ? ['*']
        : namesPart.split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());

      imports.push({
        module,
        names,
        line: node.range().start.line,
        raw: text,
      });
    }
  } else if (resolved === 'go') {
    const importNodes = rootNode.findAll({ rule: { kind: 'import_declaration' } }) || [];
    for (const node of importNodes) {
      const text = node.text();
      const pathMatch = text.match(/"([^"]+)"/);
      if (!pathMatch) continue;
      imports.push({
        module: pathMatch[1],
        names: [],
        line: node.range().start.line,
        raw: text,
      });
    }
  } else if (resolved === 'java') {
    const importNodes = rootNode.findAll({ rule: { kind: 'import_declaration' } }) || [];
    for (const node of importNodes) {
      const text = node.text();
      const match = text.match(/import\s+(?:static\s+)?([\w.*]+);/);
      if (!match) continue;
      imports.push({
        module: match[1],
        names: [],
        line: node.range().start.line,
        raw: text,
      });
    }
  } else if (resolved === 'rust') {
    const useNodes = rootNode.findAll({ rule: { kind: 'use_declaration' } }) || [];
    for (const node of useNodes) {
      const text = node.text();
      const match = text.match(/use\s+([^;]+)/);
      if (!match) continue;
      imports.push({
        module: match[1].trim(),
        names: [],
        line: node.range().start.line,
        raw: text,
      });
    }
  } else if (resolved === 'ruby') {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(require|require_relative)\s+['"]([^'"]+)['"]/);
      if (match) {
        imports.push({ module: match[2], names: [], line: i, raw: lines[i] });
      }
    }
  } else if (resolved === 'c' || resolved === 'cpp') {
    const includeNodes = rootNode.findAll({ rule: { kind: 'preproc_include' } }) || [];
    for (const node of includeNodes) {
      const text = node.text();
      const match = text.match(/#include\s+[<"]([^>"]+)[>"]/);
      if (!match) continue;
      imports.push({
        module: match[1],
        names: [],
        line: node.range().start.line,
        raw: text,
      });
    }
  }

  return imports;
}

// --- Lint ---

export function lintCode(lang: string, source: string, rules: AstRule[]): LintResult[] {
  const resolved = resolveLang(lang);
  if (!resolved) return [];

  const root = sg.parse(resolved, source);
  const rootNode = root.root();
  const results: LintResult[] = [];

  for (const rule of rules) {
    let nodes: sg.SgNode[] = [];
    if (rule.kind === 'pattern') {
      nodes = rootNode.findAll({ rule: { pattern: rule.value } }) || [];
    } else if (rule.kind === 'kind') {
      nodes = rootNode.findAll({ rule: { kind: rule.value } }) || [];
    }

    for (const node of nodes) {
      const range = node.range();
      results.push({
        message: rule.message,
        severity: rule.severity,
        line: range.start.line,
        column: range.start.column,
        text: node.text().split('\n')[0].slice(0, 80),
      });
    }
  }

  // Deduplicate by line+message
  const seen = new Set<string>();
  return results.filter(r => {
    const key = `${r.line}:${r.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Extract Structural Elements ---

export function extractElements(lang: string, source: string, target: string): ExtractResult[] {
  const resolved = resolveLang(lang);
  if (!resolved) return [];

  const root = sg.parse(resolved, source);
  const rootNode = root.root();
  const results: ExtractResult[] = [];

  const kindMap: Record<string, Record<string, string>> = {
    typescript: {
      functions: 'function_declaration',
      classes: 'class_declaration',
      imports: 'import_statement',
      exports: 'export_statement',
      variables: 'lexical_declaration',
      interfaces: 'interface_declaration',
      types: 'type_alias_declaration',
    },
    javascript: {
      functions: 'function_declaration',
      classes: 'class_declaration',
      imports: 'import_statement',
      exports: 'export_statement',
      variables: 'lexical_declaration',
    },
    python: {
      functions: 'function_definition',
      classes: 'class_definition',
      imports: 'import_statement',
    },
    rust: {
      functions: 'function_item',
      structs: 'struct_item',
      enums: 'enum_item',
      impls: 'impl_item',
      imports: 'use_declaration',
    },
    go: {
      functions: 'function_declaration',
      types: 'type_declaration',
      imports: 'import_declaration',
    },
    java: {
      functions: 'method_declaration',
      classes: 'class_declaration',
      interfaces: 'interface_declaration',
      imports: 'import_declaration',
    },
    ruby: {
      functions: 'method',
      classes: 'class',
      variables: 'assignment',
    },
    c: {
      functions: 'function_definition',
      types: 'struct_specifier',
    },
    cpp: {
      functions: 'function_definition',
      classes: 'class_specifier',
      types: 'type_identifier',
    },
    bash: {
      functions: 'function_definition',
      variables: 'variable_assignment',
    },
  };

  const langMap = kindMap[resolved] || {};
  const kindName = langMap[target];
  if (!kindName) return [];

  const nodes = rootNode.findAll({ rule: { kind: kindName } }) || [];
  for (const node of nodes) {
    const range = node.range();
    let name = '';

    // Try to extract name from common fields
    const nameNode = node.field('name');
    if (nameNode) {
      name = nameNode.text();
    }

    results.push({
      kind: kindName,
      name,
      text: node.text().split('\n').slice(0, 3).join('\n'),
      line: range.start.line,
      endLine: range.end.line,
    });
  }

  return results;
}

// --- Helpers ---

function nodeToMatch(node: sg.SgNode, pattern?: string): MatchResult {
  const range = node.range();
  const text = node.text();
  const matches = pattern ? getMetavariables(node, pattern) : {};

  return {
    text,
    line: range.start.line,
    column: range.start.column,
    endLine: range.end.line,
    endColumn: range.end.column,
    matches,
  };
}

// Helper to extract metavariable matches from a node
export function getMetavariables(node: sg.SgNode, pattern: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const varNames = [...new Set(pattern.match(/\$([A-Z_]+)/g) || [])];
  for (const varName of varNames) {
    const name = varName.slice(1);
    const matched = node.getMatch(name);
    if (matched) {
      vars[name] = matched.text();
    }
  }
  return vars;
}
