import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from './database.js';
import type { ProjectLanguage, LanguageRegistry } from './types.js';
import yaml from 'js-yaml';
import { LanguageRegistrySchema } from './types.js';

const EXTENSION_TO_LANG = new Map<string, string>();

function loadExtensionMap(dataDir: string): void {
  if (EXTENSION_TO_LANG.size > 0) return;
  const indexPath = path.join(dataDir, 'index.yaml');
  if (!fs.existsSync(indexPath)) return;
  const raw = yaml.load(fs.readFileSync(indexPath, 'utf-8')) as Record<string, unknown>;
  const registry = LanguageRegistrySchema.parse(raw);
  for (const [langId, entry] of Object.entries(registry.languages)) {
    for (const ext of entry.extensions) {
      EXTENSION_TO_LANG.set(ext, langId);
    }
  }
}

export class ProjectMemory {
  constructor(
    private db: DatabaseManager,
    private dataDir: string
  ) {}

  detectLanguages(projectPath: string): ProjectLanguage[] {
    loadExtensionMap(this.dataDir);

    const counts = new Map<string, number>();
    this.scanDirectory(projectPath, counts, 0);

    const results: ProjectLanguage[] = [];
    for (const [ext, count] of counts) {
      const lang = EXTENSION_TO_LANG.get(ext);
      if (lang) {
        const existing = results.find(r => r.language === lang);
        if (existing) {
          existing.fileCount += count;
        } else {
          results.push({ language: lang, fileCount: count, lastDetected: new Date().toISOString() });
        }
      }
    }

    // Store in DB
    for (const lang of results) {
      this.db.setProjectMemory(projectPath, lang.language, lang.fileCount);
    }

    return results.sort((a, b) => b.fileCount - a.fileCount);
  }

  getProjectLanguages(projectPath: string): ProjectLanguage[] {
    const cached = this.db.getProjectMemory(projectPath);
    if (cached.length > 0) {
      return cached.map(c => ({
        language: c.language,
        fileCount: c.fileCount,
        lastDetected: c.lastDetected,
      }));
    }
    return this.detectLanguages(projectPath);
  }

  private scanDirectory(dir: string, counts: Map<string, number>, depth: number): void {
    if (depth > 3) return; // Limit recursion depth

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Skip inaccessible directories
    }

    for (const entry of entries) {
      // Skip common non-source directories
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', 'target'].includes(entry.name)) continue;
        this.scanDirectory(path.join(dir, entry.name), counts, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext) {
          counts.set(ext, (counts.get(ext) || 0) + 1);
        }
      }
    }
  }
}
