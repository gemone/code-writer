import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { DatabaseManager } from './database.js';
import { DATA_DIR } from './constants.js';
import {
  LanguageRegistrySchema,
  LanguageMetaSchema,
  StdlibSchema,
  SyntaxSchema,
  ConventionsSchema,
  PatternsSchema,
  type LanguageRegistry,
  type LanguageData,
} from './types.js';

export class LanguageLoader {
  private db: DatabaseManager;
  private dataDir: string;
  private syncTimestamps = new Map<string, number>();
  private registryCache: LanguageRegistry | null = null;

  constructor(db: DatabaseManager, dataDir?: string) {
    this.db = db;
    this.dataDir = dataDir || DATA_DIR;
  }

  syncFromYaml(): void {
    const registry = this.loadRegistry();

    for (const [langId, entry] of Object.entries(registry.languages)) {
      const langDir = path.join(this.dataDir, entry.dataDir);
      if (!fs.existsSync(langDir)) continue;

      const dirStat = fs.statSync(langDir);
      const lastSync = this.syncTimestamps.get(langId) || 0;
      if (dirStat.mtimeMs <= lastSync) continue;

      this.db.clearLanguageData(langId);
      this.db.insertLanguage(langId, entry.name, entry.version, entry.extensions, entry.aliases);

      this.loadAndStoreStdlib(langId, langDir);
      this.loadAndStoreSyntax(langId, langDir);
      this.loadAndStoreConventions(langId, langDir);
      this.loadAndStorePatterns(langId, langDir);

      this.syncTimestamps.set(langId, Date.now());
    }
  }

  private loadRegistry(): LanguageRegistry {
    if (this.registryCache) return this.registryCache;
    const indexPath = path.join(this.dataDir, 'index.yaml');
    const raw = yaml.load(fs.readFileSync(indexPath, 'utf-8')) as Record<string, unknown>;
    this.registryCache = LanguageRegistrySchema.parse(raw);
    return this.registryCache;
  }

  private loadAndStoreStdlib(langId: string, langDir: string): void {
    const filePath = path.join(langDir, 'stdlib.yaml');
    if (!fs.existsSync(filePath)) return;
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const data = StdlibSchema.parse(raw);
    for (const mod of data.modules) {
      for (const method of mod.methods) {
        this.db.insertStdlibEntry(
          langId,
          mod.name,
          method.name,
          method.signature,
          method.description,
          method.example,
          method.tags || []
        );
      }
    }
  }

  private loadAndStoreSyntax(langId: string, langDir: string): void {
    const filePath = path.join(langDir, 'syntax.yaml');
    if (!fs.existsSync(filePath)) return;
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const data = SyntaxSchema.parse(raw);
    for (const section of data.sections) {
      for (const topic of section.topics) {
        if (topic.examples) {
          for (const ex of topic.examples) {
            this.db.insertSyntaxEntry(langId, section.name, topic.title, ex.code, ex.description);
          }
        }
      }
    }
  }

  private loadAndStoreConventions(langId: string, langDir: string): void {
    const filePath = path.join(langDir, 'conventions.yaml');
    if (!fs.existsSync(filePath)) return;
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const data = ConventionsSchema.parse(raw);
    for (const conv of data.conventions) {
      this.db.insertConvention(
        langId,
        conv.name,
        conv.rule,
        conv.severity,
        conv.example?.good,
        conv.example?.bad,
        conv.rationale
      );
    }
  }

  private loadAndStorePatterns(langId: string, langDir: string): void {
    const filePath = path.join(langDir, 'patterns.yaml');
    if (!fs.existsSync(filePath)) return;
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const data = PatternsSchema.parse(raw);
    for (const pat of data.patterns) {
      this.db.insertPattern(
        langId,
        pat.name,
        pat.description,
        pat.category,
        pat.when,
        pat.example,
        pat.relatedPatterns
      );
    }
  }

  loadLanguageMeta(langId: string): Record<string, unknown> | null {
    const registry = this.loadRegistry();
    const entry = registry.languages[langId];
    if (!entry) return null;
    const langDir = path.join(this.dataDir, entry.dataDir);
    const filePath = path.join(langDir, 'language.yaml');
    if (!fs.existsSync(filePath)) return null;
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    return LanguageMetaSchema.parse(raw) as Record<string, unknown>;
  }

  getRegisteredLanguages(): string[] {
    const registry = this.loadRegistry();
    return Object.keys(registry.languages);
  }

  getDataDir(): string {
    return this.dataDir;
  }
}
