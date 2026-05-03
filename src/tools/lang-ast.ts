import { parseCode, findPattern, replacePattern, extractImports, extractElements, lintCode, isSupported, type AstRule } from '../engine/ast.js';

export function createLangAstTool() {
  return {
    name: 'lang_ast' as const,
    description: 'AST-based code operations using tree-sitter. Query patterns, replace code, lint with structural rules, or extract elements like functions/classes/imports.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        language: { type: 'string', description: "Programming language (e.g., 'typescript', 'python', 'rust')" },
        operation: { type: 'string', enum: ['query', 'replace', 'lint', 'extract'], description: 'Operation to perform' },
        code: { type: 'string', description: 'Source code to analyze' },
        pattern: { type: 'string', description: "AST pattern for query/replace (e.g., 'console.log($A)', 'function $NAME($$$) {}')" },
        replacement: { type: 'string', description: "Replacement pattern for replace operation (e.g., 'logger.info($A)')" },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['pattern', 'kind'], description: "'pattern' for AST pattern match, 'kind' for node type match" },
              value: { type: 'string', description: 'Pattern string or node kind name' },
              message: { type: 'string', description: 'Lint message' },
              severity: { type: 'string', enum: ['error', 'warn', 'info'], description: 'Severity level' },
            },
            required: ['kind', 'value', 'message', 'severity'],
          },
          description: 'Lint rules for lint operation',
        },
        target: { type: 'string', enum: ['imports', 'functions', 'classes', 'exports', 'variables', 'interfaces', 'types'], description: 'Element type for extract operation' },
      },
      required: ['language', 'operation', 'code'],
    },
    handler: async (args: {
      language: string;
      operation: string;
      code: string;
      pattern?: string;
      replacement?: string;
      rules?: AstRule[];
      target?: string;
    }) => {
      const lang = args.language.toLowerCase();

      if (!isSupported(lang)) {
        return {
          content: [{ type: 'text' as const, text: `Language "${lang}" is not supported for AST operations. Supported: typescript, javascript, python, rust, go, java, ruby, c, cpp, bash` }],
          isError: true,
        };
      }

      try {
        switch (args.operation) {
          case 'query':
            return handleQuery(lang, args.code, args.pattern);
          case 'replace':
            return handleReplace(lang, args.code, args.pattern, args.replacement);
          case 'lint':
            return handleLint(lang, args.code, args.rules);
          case 'extract':
            return handleExtract(lang, args.code, args.target);
          default:
            return {
              content: [{ type: 'text' as const, text: `Unknown operation: ${args.operation}. Use: query, replace, lint, extract` }],
              isError: true,
            };
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `AST error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  };
}

function handleQuery(lang: string, code: string, pattern?: string) {
  if (!pattern) {
    return {
      content: [{ type: 'text' as const, text: 'Pattern is required for query operation.' }],
      isError: true,
    };
  }

  const root = parseCode(lang, code);
  const matches = findPattern(root, pattern);

  if (matches.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `No matches found for pattern: \`${pattern}\`` }],
    };
  }

  let text = `# AST Query Results\n\n**Pattern:** \`${pattern}\`\n**Language:** ${lang}\n**Matches:** ${matches.length}\n\n`;
  for (const m of matches) {
    text += `### Line ${m.line + 1}\n`;
    text += `\`\`\`\n${m.text}\n\`\`\`\n\n`;
  }

  return { content: [{ type: 'text' as const, text }] };
}

function handleReplace(lang: string, code: string, pattern?: string, replacement?: string) {
  if (!pattern || !replacement) {
    return {
      content: [{ type: 'text' as const, text: 'Both pattern and replacement are required for replace operation.' }],
      isError: true,
    };
  }

  const root = parseCode(lang, code);
  const result = replacePattern(root, pattern, replacement);

  let text = `# AST Replace Results\n\n**Pattern:** \`${pattern}\`\n**Replacement:** \`${replacement}\`\n\n`;
  text += `### Original\n\`\`\`\n${code}\n\`\`\`\n\n`;
  text += `### Result\n\`\`\`\n${result}\n\`\`\``;

  return { content: [{ type: 'text' as const, text }] };
}

function handleLint(lang: string, code: string, rules?: AstRule[]) {
  if (!rules || rules.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'Rules are required for lint operation.' }],
      isError: true,
    };
  }

  const results = lintCode(lang, code, rules);

  if (results.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `No violations found. Code passes all ${rules.length} rules.` }],
    };
  }

  let text = `# AST Lint Results\n\n**Language:** ${lang}\n**Violations:** ${results.length}\n\n`;
  for (const r of results) {
    const icon = r.severity === 'error' ? '🔴' : r.severity === 'warn' ? '🟡' : '🔵';
    text += `${icon} **Line ${r.line + 1}** — ${r.message}\n`;
    text += `\`\`\`\n${r.text}\n\`\`\`\n\n`;
  }

  return { content: [{ type: 'text' as const, text }] };
}

function handleExtract(lang: string, code: string, target?: string) {
  if (!target) {
    return {
      content: [{ type: 'text' as const, text: 'Target is required for extract operation. Use: imports, functions, classes, exports, variables, interfaces, types' }],
      isError: true,
    };
  }

  if (target === 'imports') {
    const imports = extractImports(lang, code);
    if (imports.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No imports found.' }] };
    }

    let text = `# Import Analysis\n\n**Language:** ${lang}\n**Imports:** ${imports.length}\n\n`;
    for (const imp of imports) {
      text += `- **Line ${imp.line + 1}:** \`${imp.raw}\`\n`;
      if (imp.names.length > 0) {
        text += `  Names: ${imp.names.join(', ')}\n`;
      }
    }

    return { content: [{ type: 'text' as const, text }] };
  }

  const elements = extractElements(lang, code, target);
  if (elements.length === 0) {
    return { content: [{ type: 'text' as const, text: `No ${target} found.` }] };
  }

  let text = `# ${target.charAt(0).toUpperCase() + target.slice(1)} Analysis\n\n**Language:** ${lang}\n**Found:** ${elements.length}\n\n`;
  for (const el of elements) {
    const name = el.name ? ` — \`${el.name}\`` : '';
    text += `### Line ${el.line + 1}${name}\n`;
    text += `\`\`\`\n${el.text}\n\`\`\`\n\n`;
  }

  return { content: [{ type: 'text' as const, text }] };
}
