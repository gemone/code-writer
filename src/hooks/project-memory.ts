import fs from 'node:fs';
import path from 'node:path';
import { DatabaseManager } from '../engine/database.js';
import { EXT_TO_LANG } from '../shared/lang-map.js';

interface HookInput {
  tool_input?: {
    file_path?: string;
  };
}

function updateClaudeMd(projectPath: string, languages: string[]): void {
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  const marker = '<!-- code-writer: project-languages -->';
  const endMarker = '<!-- /code-writer: project-languages -->';

  const langList = languages.join(', ');
  const block = `${marker}\n## Project Languages\n${langList}\n${endMarker}`;

  let content = '';
  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, 'utf-8');
  }

  if (content.includes(marker)) {
    // Replace existing block
    const regex = new RegExp(`${marker}[\\s\\S]*?${endMarker}`);
    content = content.replace(regex, block);
  } else {
    // Append block
    content = content.trimEnd() + '\n\n' + block + '\n';
  }

  fs.writeFileSync(claudeMdPath, content);
}

const input = fs.readFileSync(0, 'utf-8');
try {
  const data: HookInput = JSON.parse(input);
  const filePath = data.tool_input?.file_path;
  if (!filePath) { process.exit(0); }

  const ext = path.extname(filePath).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (!lang) { process.exit(0); }

  const projectPath = process.cwd();
  const db = new DatabaseManager();

  // Update SQLite
  const existing = db.getProjectMemory(projectPath);
  const langEntry = existing.find(e => e.language === lang);
  db.setProjectMemory(projectPath, lang, (langEntry?.fileCount || 0) + 1);

  // Get all project languages and update CLAUDE.md
  const allLangs = db.getProjectMemory(projectPath);
  db.close();

  if (allLangs.length > 0) {
    const langNames = allLangs.map(l => l.language);
    updateClaudeMd(projectPath, langNames);
  }
} catch {
  // Silent failure
}
process.exit(0);
