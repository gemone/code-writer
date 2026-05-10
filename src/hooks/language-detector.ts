import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { LanguageRegistrySchema } from '../engine/types.js';
import { DATA_DIR } from '../engine/constants.js';
import { EXT_TO_LANG } from '../shared/lang-map.js';

const dataDir = DATA_DIR;

function loadLanguageHints(): Map<string, { name: string; quickReference: Record<string, string> }> {
  const hints = new Map<string, { name: string; quickReference: Record<string, string> }>();
  const indexPath = path.join(dataDir, 'index.yaml');
  if (!fs.existsSync(indexPath)) return hints;

  const raw = yaml.load(fs.readFileSync(indexPath, 'utf-8')) as Record<string, unknown>;
  const registry = LanguageRegistrySchema.parse(raw);

  for (const [langId, entry] of Object.entries(registry.languages)) {
    const langFile = path.join(dataDir, entry.dataDir, 'language.yaml');
    if (!fs.existsSync(langFile)) continue;
    try {
      const langData = yaml.load(fs.readFileSync(langFile, 'utf-8')) as Record<string, unknown>;
      hints.set(langId, {
        name: langData.name as string,
        quickReference: (langData.quickReference as Record<string, string>) || {},
      });
      // Also register aliases
      for (const alias of entry.aliases || []) {
        hints.set(alias, hints.get(langId)!);
      }
    } catch {
      // Skip malformed files
    }
  }
  return hints;
}

function detectLanguage(prompt: string, hints: Map<string, { name: string; quickReference: Record<string, string> }>): string | null {
  const lower = prompt.toLowerCase();

  // Check for explicit language mentions
  for (const [key, data] of hints) {
    if (lower.includes(key.toLowerCase()) || lower.includes(data.name.toLowerCase())) {
      return key;
    }
  }

  // Check for file extensions
  const extMatch = lower.match(/\.\w+/);
  if (extMatch) {
    return EXT_TO_LANG[extMatch[0]] || null;
  }

  return null;
}

function buildReminder(langId: string, data: { name: string; quickReference: Record<string, string> }): string {
  let reminder = `<system-reminder>\nDetected language: ${data.name}. Quick reference:\n\n`;
  const entries = Object.entries(data.quickReference);
  for (const [key, value] of entries.slice(0, 3)) {
    reminder += `**${key}:**\n\`\`\`\n${value.trim()}\n\`\`\`\n\n`;
  }
  reminder += `Use \`lang_ref(language: "${langId}")\` for more details.\n</system-reminder>`;
  return reminder;
}

// Read stdin
const input = fs.readFileSync(0, 'utf-8');
try {
  const data = JSON.parse(input);
  const prompt = data.prompt || '';
  const hints = loadLanguageHints();
  const detected = detectLanguage(prompt, hints);
  if (detected) {
    const hint = hints.get(detected);
    if (hint) {
      process.stdout.write(buildReminder(detected, hint));
    }
  }
} catch {
  // Silent failure on parse errors
}
process.exit(0);
