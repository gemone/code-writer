import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { APP_DIR } from './constants.js';

const DEFAULT_DB_DIR = APP_DIR;

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    const dir = dbPath || DEFAULT_DB_DIR;
    fs.mkdirSync(dir, { recursive: true });
    this.dbPath = path.join(dir, 'data.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('cache_size = -64000'); // 64MB
    this.db.pragma('mmap_size = 268435456'); // 256MB
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS languages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        extensions TEXT NOT NULL,
        aliases TEXT,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS stdlib_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_id TEXT NOT NULL,
        module TEXT NOT NULL,
        method TEXT NOT NULL,
        signature TEXT,
        description TEXT NOT NULL,
        example TEXT,
        tags TEXT,
        FOREIGN KEY (language_id) REFERENCES languages(id)
      );

      CREATE TABLE IF NOT EXISTS syntax_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_id TEXT NOT NULL,
        section TEXT NOT NULL,
        topic TEXT NOT NULL,
        code TEXT NOT NULL,
        description TEXT,
        FOREIGN KEY (language_id) REFERENCES languages(id)
      );

      CREATE TABLE IF NOT EXISTS conventions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_id TEXT NOT NULL,
        name TEXT NOT NULL,
        rule TEXT NOT NULL,
        severity TEXT,
        good_example TEXT,
        bad_example TEXT,
        rationale TEXT,
        FOREIGN KEY (language_id) REFERENCES languages(id)
      );

      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        description TEXT NOT NULL,
        when_to_use TEXT,
        example TEXT,
        related_patterns TEXT,
        FOREIGN KEY (language_id) REFERENCES languages(id)
      );

      CREATE TABLE IF NOT EXISTS project_memory (
        project_path TEXT NOT NULL,
        language TEXT NOT NULL,
        file_count INTEGER NOT NULL DEFAULT 0,
        last_detected TEXT NOT NULL,
        PRIMARY KEY (project_path, language)
      );

      CREATE INDEX IF NOT EXISTS idx_stdlib_lang ON stdlib_entries(language_id);
      CREATE INDEX IF NOT EXISTS idx_syntax_lang ON syntax_entries(language_id);
      CREATE INDEX IF NOT EXISTS idx_conventions_lang ON conventions(language_id);
      CREATE INDEX IF NOT EXISTS idx_patterns_lang ON patterns(language_id);
    `);
  }

  // --- Language ---

  insertLanguage(id: string, name: string, version: string, extensions: string[], aliases?: string[], metadata?: Record<string, unknown>): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO languages (id, name, version, extensions, aliases, metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(id, name, version, JSON.stringify(extensions), aliases ? JSON.stringify(aliases) : null, metadata ? JSON.stringify(metadata) : null);
  }

  getLanguage(id: string): { id: string; name: string; version: string; extensions: string[]; aliases: string[] } | undefined {
    const row = this.db.prepare('SELECT * FROM languages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id as string,
      name: row.name as string,
      version: row.version as string,
      extensions: JSON.parse(row.extensions as string),
      aliases: row.aliases ? JSON.parse(row.aliases as string) : [],
    };
  }

  getAllLanguages(): { id: string; name: string; version: string; extensions: string[]; aliases: string[] }[] {
    const rows = this.db.prepare('SELECT * FROM languages').all() as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      name: row.name as string,
      version: row.version as string,
      extensions: JSON.parse(row.extensions as string),
      aliases: row.aliases ? JSON.parse(row.aliases as string) : [],
    }));
  }

  // --- Stdlib ---

  insertStdlibEntry(languageId: string, module: string, method: string, signature: string | undefined, description: string, example: string | undefined, tags: string[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO stdlib_entries (language_id, module, method, signature, description, example, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(languageId, module, method, signature || null, description, example || null, JSON.stringify(tags));
  }

  getStdlibMethods(languageId: string, module?: string, method?: string): Record<string, unknown>[] {
    if (method && module) {
      return this.db.prepare('SELECT * FROM stdlib_entries WHERE language_id = ? AND module = ? AND method = ?').all(languageId, module, method) as Record<string, unknown>[];
    }
    if (module) {
      return this.db.prepare('SELECT * FROM stdlib_entries WHERE language_id = ? AND module = ?').all(languageId, module) as Record<string, unknown>[];
    }
    return this.db.prepare('SELECT * FROM stdlib_entries WHERE language_id = ?').all(languageId) as Record<string, unknown>[];
  }

  getAllStdlibEntries(): Record<string, unknown>[] {
    return this.db.prepare('SELECT * FROM stdlib_entries').all() as Record<string, unknown>[];
  }

  // --- Syntax ---

  insertSyntaxEntry(languageId: string, section: string, topic: string, code: string, description?: string): void {
    const stmt = this.db.prepare(
      'INSERT INTO syntax_entries (language_id, section, topic, code, description) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(languageId, section, topic, code, description || null);
  }

  getSyntaxEntries(languageId: string, section?: string): Record<string, unknown>[] {
    if (section) {
      return this.db.prepare('SELECT * FROM syntax_entries WHERE language_id = ? AND section = ?').all(languageId, section) as Record<string, unknown>[];
    }
    return this.db.prepare('SELECT * FROM syntax_entries WHERE language_id = ?').all(languageId) as Record<string, unknown>[];
  }

  // --- Conventions ---

  insertConvention(languageId: string, name: string, rule: string, severity?: string, goodExample?: string, badExample?: string, rationale?: string): void {
    const stmt = this.db.prepare(
      'INSERT INTO conventions (language_id, name, rule, severity, good_example, bad_example, rationale) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(languageId, name, rule, severity || null, goodExample || null, badExample || null, rationale || null);
  }

  getConventions(languageId?: string, severity?: string): Record<string, unknown>[] {
    if (languageId && severity && severity !== 'all') {
      return this.db.prepare('SELECT * FROM conventions WHERE language_id = ? AND severity = ?').all(languageId, severity) as Record<string, unknown>[];
    }
    if (languageId) {
      return this.db.prepare('SELECT * FROM conventions WHERE language_id = ?').all(languageId) as Record<string, unknown>[];
    }
    if (severity && severity !== 'all') {
      return this.db.prepare('SELECT * FROM conventions WHERE severity = ?').all(severity) as Record<string, unknown>[];
    }
    return this.db.prepare('SELECT * FROM conventions').all() as Record<string, unknown>[];
  }

  // --- Patterns ---

  insertPattern(languageId: string, name: string, description: string, category?: string, whenToUse?: string, example?: string, relatedPatterns?: string[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO patterns (language_id, name, category, description, when_to_use, example, related_patterns) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(languageId, name, category || null, description, whenToUse || null, example || null, relatedPatterns ? JSON.stringify(relatedPatterns) : null);
  }

  getPatterns(languageId: string): Record<string, unknown>[] {
    return this.db.prepare('SELECT * FROM patterns WHERE language_id = ?').all(languageId) as Record<string, unknown>[];
  }

  // --- Project Memory ---

  getProjectMemory(projectPath: string): { language: string; fileCount: number; lastDetected: string }[] {
    const rows = this.db.prepare('SELECT language, file_count, last_detected FROM project_memory WHERE project_path = ? ORDER BY file_count DESC').all(projectPath) as Record<string, unknown>[];
    return rows.map(r => ({
      language: r.language as string,
      fileCount: r.file_count as number,
      lastDetected: r.last_detected as string,
    }));
  }

  setProjectMemory(projectPath: string, language: string, fileCount: number): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO project_memory (project_path, language, file_count, last_detected) VALUES (?, ?, ?, ?)'
    );
    stmt.run(projectPath, language, fileCount, new Date().toISOString());
  }

  // --- Search helpers ---

  searchAll(query: string, languageId?: string): Record<string, unknown>[] {
    const escaped = query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const q = `%${escaped}%`;
    const results: Record<string, unknown>[] = [];

    const stdlibQuery = languageId
      ? this.db.prepare("SELECT *, 'stdlib' as source_type FROM stdlib_entries WHERE language_id = ? AND (method LIKE ? OR description LIKE ? OR tags LIKE ?)")
      : this.db.prepare("SELECT *, 'stdlib' as source_type FROM stdlib_entries WHERE method LIKE ? OR description LIKE ? OR tags LIKE ?");
    const stdlibRows = languageId ? stdlibQuery.all(languageId, q, q, q) : stdlibQuery.all(q, q, q);
    results.push(...(stdlibRows as Record<string, unknown>[]));

    const syntaxQuery = languageId
      ? this.db.prepare("SELECT *, 'syntax' as source_type FROM syntax_entries WHERE language_id = ? AND (topic LIKE ? OR code LIKE ? OR description LIKE ?)")
      : this.db.prepare("SELECT *, 'syntax' as source_type FROM syntax_entries WHERE topic LIKE ? OR code LIKE ? OR description LIKE ?");
    const syntaxRows = languageId ? syntaxQuery.all(languageId, q, q, q) : syntaxQuery.all(q, q, q);
    results.push(...(syntaxRows as Record<string, unknown>[]));

    const convQuery = languageId
      ? this.db.prepare("SELECT *, 'conventions' as source_type FROM conventions WHERE language_id = ? AND (name LIKE ? OR rule LIKE ?)")
      : this.db.prepare("SELECT *, 'conventions' as source_type FROM conventions WHERE name LIKE ? OR rule LIKE ?");
    const convRows = languageId ? convQuery.all(languageId, q, q) : convQuery.all(q, q);
    results.push(...(convRows as Record<string, unknown>[]));

    const patQuery = languageId
      ? this.db.prepare("SELECT *, 'patterns' as source_type FROM patterns WHERE language_id = ? AND (name LIKE ? OR description LIKE ?)")
      : this.db.prepare("SELECT *, 'patterns' as source_type FROM patterns WHERE name LIKE ? OR description LIKE ?");
    const patRows = languageId ? patQuery.all(languageId, q, q) : patQuery.all(q, q);
    results.push(...(patRows as Record<string, unknown>[]));

    return results;
  }

  // --- Lifecycle ---

  clearLanguageData(languageId: string): void {
    this.db.prepare('DELETE FROM stdlib_entries WHERE language_id = ?').run(languageId);
    this.db.prepare('DELETE FROM syntax_entries WHERE language_id = ?').run(languageId);
    this.db.prepare('DELETE FROM conventions WHERE language_id = ?').run(languageId);
    this.db.prepare('DELETE FROM patterns WHERE language_id = ?').run(languageId);
    this.db.prepare('DELETE FROM languages WHERE id = ?').run(languageId);
  }

  close(): void {
    this.db.close();
  }
}
