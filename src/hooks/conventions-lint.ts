import fs from 'node:fs';
import path from 'node:path';
import { DatabaseManager } from '../engine/database.js';

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

const VIOLATIONS: Record<string, { pattern: RegExp; message: string; severity: string }[]> = {
  typescript: [
    { pattern: /\bvar\s+/, message: 'Use `const` or `let` instead of `var`.', severity: 'error' },
    { pattern: /:\s*any\b/, message: 'Avoid `any` type. Use `unknown` and narrow with type guards.', severity: 'warn' },
  ],
  python: [
    { pattern: /import\s+os\.path/, message: 'Prefer `pathlib.Path` over `os.path`.', severity: 'warn' },
    { pattern: /\.format\(/, message: 'Prefer f-strings over `.format()`.', severity: 'info' },
  ],
};

const input = fs.readFileSync(0, 'utf-8');
try {
  const data: HookInput = JSON.parse(input);
  const filePath = data.tool_input?.file_path;
  if (!filePath) { process.exit(0); }

  const ext = path.extname(filePath).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (!lang) { process.exit(0); }

  // Read file content
  let content = data.tool_input?.content;
  if (!content && fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }
  if (!content) { process.exit(0); }

  const langViolations = VIOLATIONS[lang] || [];
  const findings: { message: string; severity: string }[] = [];

  for (const v of langViolations) {
    if (v.pattern.test(content)) {
      findings.push({ message: v.message, severity: v.severity });
    }
  }

  if (findings.length > 0) {
    let reminder = `<system-reminder>\nConvention violations found in ${path.basename(filePath)}:\n\n`;
    for (const f of findings) {
      const icon = f.severity === 'error' ? '🔴' : f.severity === 'warn' ? '🟡' : '🔵';
      reminder += `${icon} ${f.message}\n`;
    }
    reminder += `\nUse \`lang_conventions(language: "${lang}")\` for full conventions.\n</system-reminder>`;
    process.stdout.write(reminder);
  }
} catch {
  // Silent failure
}
process.exit(0);
