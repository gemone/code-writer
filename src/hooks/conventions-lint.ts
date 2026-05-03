import fs from 'node:fs';
import path from 'node:path';
import { lintCode, isSupported, type AstRule } from '../engine/ast.js';

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.py': 'python', '.pyi': 'python', '.pyw': 'python',
  '.rs': 'rust', '.go': 'go', '.java': 'java', '.rb': 'ruby',
};

interface HookInput {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    content?: string;
  };
}

const AST_RULES: Record<string, AstRule[]> = {
  typescript: [
    { kind: 'pattern', value: 'var $NAME = $VALUE', message: 'Use `const` or `let` instead of `var`.', severity: 'error' },
    { kind: 'pattern', value: '$A == $B', message: 'Use `===` and `!==` instead of `==` and `!=`.', severity: 'warn' },
    { kind: 'pattern', value: 'console.log($$$ARGS)', message: 'Remove `console.log` in production code.', severity: 'info' },
    { kind: 'pattern', value: '$A != $B', message: 'Use `!==` instead of `!=`.', severity: 'warn' },
  ],
  python: [
    { kind: 'kind', value: 'wildcard_import', message: 'Avoid wildcard imports. Import specific names.', severity: 'warn' },
  ],
};

const input = fs.readFileSync(0, 'utf-8');
try {
  const data: HookInput = JSON.parse(input);
  const filePath = data.tool_input?.file_path;
  if (!filePath) { process.exit(0); }

  const ext = path.extname(filePath).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (!lang || !isSupported(lang)) { process.exit(0); }

  // Read file content
  let content = data.tool_input?.content;
  if (!content && fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }
  if (!content) { process.exit(0); }

  const rules = AST_RULES[lang] || [];
  if (rules.length === 0) { process.exit(0); }

  // AST-based linting with line numbers
  const results = lintCode(lang, content, rules);

  // For Python, also check bare except clauses via kind matching
  if (lang === 'python') {
    const { parseCode } = require('../engine/ast.js');
    const root = parseCode(lang, content);
    const exceptClauses = root.root().findAll({ rule: { kind: 'except_clause' } }) || [];
    for (const clause of exceptClauses) {
      // Bare except: has only 'except', ':', 'block' children (no exception type)
      const children = clause.children();
      const hasType = children.length > 3 || (children.length === 3 && children[1].kind() !== ':');
      if (!hasType) {
        results.push({
          message: 'Bare `except:` is prohibited. Catch specific exceptions.',
          severity: 'error',
          line: clause.range().start.line,
          column: clause.range().start.column,
          text: clause.text().split('\n')[0],
        });
      }
    }
  }

  if (results.length === 0) { process.exit(0); }

  let reminder = `<system-reminder>\nConvention violations found in ${path.basename(filePath)}:\n\n`;
  for (const r of results) {
    const icon = r.severity === 'error' ? '🔴' : r.severity === 'warn' ? '🟡' : '🔵';
    reminder += `${icon} Line ${r.line + 1}: ${r.message}\n`;
  }
  reminder += `\nUse \`lang_conventions(language: "${lang}")\` for full conventions.\n</system-reminder>`;
  process.stdout.write(reminder);
} catch {
  // Silent failure
}
process.exit(0);
