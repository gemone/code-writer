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

      CREATE TABLE IF NOT EXISTS dep_registry (
        id TEXT PRIMARY KEY,
        library_name TEXT NOT NULL,
        scope TEXT,
        resolved_version TEXT NOT NULL,
        version_range TEXT,
        language TEXT NOT NULL,
        package_manager TEXT,
        description TEXT,
        source_url TEXT,
        context7_id TEXT,
        metadata_json TEXT,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_indexed INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS dep_apis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dep_id TEXT NOT NULL,
        module TEXT NOT NULL,
        export_name TEXT NOT NULL,
        export_kind TEXT NOT NULL DEFAULT 'function',
        signature TEXT,
        description TEXT NOT NULL,
        example TEXT,
        since_version TEXT,
        deprecated_version TEXT,
        tags TEXT,
        source_type TEXT NOT NULL DEFAULT 'context7',
        FOREIGN KEY (dep_id) REFERENCES dep_registry(id)
      );

      CREATE TABLE IF NOT EXISTS dep_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dep_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        description TEXT NOT NULL,
        code_example TEXT NOT NULL,
        context TEXT,
        related_patterns TEXT,
        tags TEXT,
        FOREIGN KEY (dep_id) REFERENCES dep_registry(id)
      );

      CREATE TABLE IF NOT EXISTS dep_considerations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dep_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        affected_version_range TEXT,
        fix_suggestion TEXT,
        severity TEXT,
        source_url TEXT,
        FOREIGN KEY (dep_id) REFERENCES dep_registry(id)
      );

      CREATE TABLE IF NOT EXISTS dep_version_cache (
        library_name TEXT NOT NULL,
        language TEXT NOT NULL,
        version_range TEXT NOT NULL,
        resolved_version TEXT NOT NULL,
        dep_id TEXT NOT NULL,
        cached_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (library_name, language, version_range)
      );

      CREATE INDEX IF NOT EXISTS idx_dep_registry_name ON dep_registry(library_name);
      CREATE INDEX IF NOT EXISTS idx_dep_registry_lang ON dep_registry(language);
      CREATE INDEX IF NOT EXISTS idx_dep_apis_dep ON dep_apis(dep_id);
      CREATE INDEX IF NOT EXISTS idx_dep_patterns_dep ON dep_patterns(dep_id);
      CREATE INDEX IF NOT EXISTS idx_dep_considerations_dep ON dep_considerations(dep_id);
      CREATE INDEX IF NOT EXISTS idx_dep_apis_search ON dep_apis(export_name, module);
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

  getStdlibEntriesByLanguage(languageId: string): Record<string, unknown>[] {
    return this.db.prepare('SELECT * FROM stdlib_entries WHERE language_id = ?').all(languageId) as Record<string, unknown>[];
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
    const words = query.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];
    const results: Record<string, unknown>[] = [];

    const stdlibFields = ['method', 'module', 'description', 'tags'];
    results.push(...this.searchTable('stdlib_entries', 'stdlib', stdlibFields, words, languageId));

    const syntaxFields = ['topic', 'code', 'description'];
    results.push(...this.searchTable('syntax_entries', 'syntax', syntaxFields, words, languageId));

    const convFields = ['name', 'rule'];
    results.push(...this.searchTable('conventions', 'conventions', convFields, words, languageId));

    const patFields = ['name', 'description'];
    results.push(...this.searchTable('patterns', 'patterns', patFields, words, languageId));

    return results;
  }

  private searchTable(
    table: string,
    sourceType: string,
    fields: string[],
    words: string[],
    languageId?: string,
  ): Record<string, unknown>[] {
    return this.searchGeneric({
      table,
      sourceType,
      fields,
      words,
      extraWhere: languageId ? 'AND language_id = ?' : '',
      extraParams: languageId ? [languageId] : [],
    });
  }

  private searchDepTable(
    table: string,
    sourceType: string,
    fields: string[],
    words: string[],
    language?: string,
    libraryName?: string,
  ): Record<string, unknown>[] {
    const extraWhere: string[] = [];
    const extraParams: unknown[] = [];
    if (language) { extraWhere.push('dr.language = ?'); extraParams.push(language); }
    if (libraryName) { extraWhere.push('dr.library_name = ?'); extraParams.push(libraryName); }

    return this.searchGeneric({
      table,
      sourceType,
      fields,
      words,
      alias: 't',
      join: 'JOIN dep_registry dr ON t.dep_id = dr.id',
      extraColumns: ', dr.library_name, dr.resolved_version, dr.language',
      extraWhere: extraWhere.length > 0 ? `AND ${extraWhere.join(' AND ')}` : '',
      extraParams,
    });
  }

  private searchGeneric(opts: {
    table: string;
    sourceType: string;
    fields: string[];
    words: string[];
    alias?: string;
    join?: string;
    extraColumns?: string;
    extraWhere?: string;
    extraParams?: unknown[];
  }): Record<string, unknown>[] {
    const { table, sourceType, fields, words, alias, join, extraColumns = '', extraWhere = '', extraParams = [] } = opts;
    const prefix = alias ? `${alias}.` : '';

    const wordsLike = words.map(w => {
      const escaped = w.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      return `%${escaped}%`;
    });

    const fromClause = alias && join ? `${table} ${alias} ${join}` : table;
    const selectCols = alias ? `${alias}.*, '${sourceType}' as source_type${extraColumns}` : `*, '${sourceType}' as source_type${extraColumns}`;

    // AND: every word must match at least one field
    const andConditions = wordsLike.map(() =>
      `(${fields.map(f => `${prefix}${f} LIKE ?`).join(' OR ')})`
    );
    const andParams = wordsLike.flatMap(like => fields.map(() => like));
    const andWhere = andConditions.join(' AND ');

    const andSql = `SELECT ${selectCols} FROM ${fromClause} WHERE ${andWhere} ${extraWhere}`;
    const andResults = this.db.prepare(andSql).all(...andParams, ...extraParams) as Record<string, unknown>[];
    if (andResults.length > 0) return andResults;

    // Fallback OR: any word matches any field
    const orConditions = wordsLike.map(() =>
      `(${fields.map(f => `${prefix}${f} LIKE ?`).join(' OR ')})`
    );
    const orParams = wordsLike.flatMap(like => fields.map(() => like));
    const orWhere = orConditions.join(' OR ');

    const orSql = `SELECT ${selectCols} FROM ${fromClause} WHERE ${orWhere} ${extraWhere}`;
    return this.db.prepare(orSql).all(...orParams, ...extraParams) as Record<string, unknown>[];
  }

  // --- Dependencies: Insert ---

  insertDepRegistry(params: {
    id: string; libraryName: string; scope?: string; resolvedVersion: string;
    versionRange?: string; language: string; packageManager?: string;
    description?: string; sourceUrl?: string; context7Id?: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO dep_registry
        (id, library_name, scope, resolved_version, version_range, language,
         package_manager, description, source_url, context7_id, metadata_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(params.id, params.libraryName, params.scope || null,
      params.resolvedVersion, params.versionRange || null, params.language,
      params.packageManager || null, params.description || null,
      params.sourceUrl || null, params.context7Id || null,
      params.metadata ? JSON.stringify(params.metadata) : null);
  }

  insertDepApi(params: {
    depId: string; module: string; exportName: string; exportKind?: string;
    signature?: string; description: string; example?: string;
    sinceVersion?: string; deprecatedVersion?: string;
    tags?: string[]; sourceType?: string;
  }): void {
    this.db.prepare(
      `INSERT INTO dep_apis
        (dep_id, module, export_name, export_kind, signature, description,
         example, since_version, deprecated_version, tags, source_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(params.depId, params.module, params.exportName,
      params.exportKind || 'function', params.signature || null,
      params.description, params.example || null, params.sinceVersion || null,
      params.deprecatedVersion || null, params.tags ? JSON.stringify(params.tags) : null,
      params.sourceType || 'context7');
  }

  insertDepPattern(params: {
    depId: string; name: string; category?: string; description: string;
    codeExample: string; context?: string; relatedPatterns?: string[];
    tags?: string[];
  }): void {
    this.db.prepare(
      `INSERT INTO dep_patterns
        (dep_id, name, category, description, code_example, context, related_patterns, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(params.depId, params.name, params.category || null,
      params.description, params.codeExample, params.context || null,
      params.relatedPatterns ? JSON.stringify(params.relatedPatterns) : null,
      params.tags ? JSON.stringify(params.tags) : null);
  }

  insertDepConsideration(params: {
    depId: string; title: string; category: string; description: string;
    affectedVersionRange?: string; fixSuggestion?: string;
    severity?: string; sourceUrl?: string;
  }): void {
    this.db.prepare(
      `INSERT INTO dep_considerations
        (dep_id, title, category, description, affected_version_range,
         fix_suggestion, severity, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(params.depId, params.title, params.category, params.description,
      params.affectedVersionRange || null, params.fixSuggestion || null,
      params.severity || null, params.sourceUrl || null);
  }

  insertDepVersionCache(params: {
    libraryName: string; language: string; versionRange: string;
    resolvedVersion: string; depId: string;
  }): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO dep_version_cache
        (library_name, language, version_range, resolved_version, dep_id, cached_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(params.libraryName, params.language, params.versionRange,
      params.resolvedVersion, params.depId);
  }

  // --- Dependencies: Query ---

  getDepRegistry(id: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM dep_registry WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  }

  getDepRegistryByName(libraryName: string, language?: string): Record<string, unknown>[] {
    if (language) {
      return this.db.prepare('SELECT * FROM dep_registry WHERE library_name = ? AND language = ?').all(libraryName, language) as Record<string, unknown>[];
    }
    return this.db.prepare('SELECT * FROM dep_registry WHERE library_name = ?').all(libraryName) as Record<string, unknown>[];
  }

  getDepRegistriesByNames(names: string[], language?: string): Set<string> {
    if (names.length === 0) return new Set();
    const placeholders = names.map(() => '?').join(',');
    const sql = language
      ? `SELECT DISTINCT library_name FROM dep_registry WHERE library_name IN (${placeholders}) AND language = ?`
      : `SELECT DISTINCT library_name FROM dep_registry WHERE library_name IN (${placeholders})`;
    const params = language ? [...names, language] : names;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return new Set(rows.map(r => r.library_name as string));
  }

  findDepRegistry(libraryName: string, versionRange: string, language: string): Record<string, unknown> | undefined {
    return this.db.prepare(
      'SELECT * FROM dep_registry WHERE library_name = ? AND version_range = ? AND language = ?'
    ).get(libraryName, versionRange, language) as Record<string, unknown> | undefined;
  }

  getDepApis(depId: string, module?: string, exportName?: string): Record<string, unknown>[] {
    if (module && exportName) {
      return this.db.prepare('SELECT * FROM dep_apis WHERE dep_id = ? AND module = ? AND export_name = ?').all(depId, module, exportName) as Record<string, unknown>[];
    }
    if (module) {
      return this.db.prepare('SELECT * FROM dep_apis WHERE dep_id = ? AND module = ?').all(depId, module) as Record<string, unknown>[];
    }
    return this.db.prepare('SELECT * FROM dep_apis WHERE dep_id = ?').all(depId) as Record<string, unknown>[];
  }

  getDepPatterns(depId: string, category?: string): Record<string, unknown>[] {
    if (category) {
      return this.db.prepare('SELECT * FROM dep_patterns WHERE dep_id = ? AND category = ?').all(depId, category) as Record<string, unknown>[];
    }
    return this.db.prepare('SELECT * FROM dep_patterns WHERE dep_id = ?').all(depId) as Record<string, unknown>[];
  }

  getDepConsiderations(depId: string, category?: string, severity?: string): Record<string, unknown>[] {
    if (category && severity) {
      return this.db.prepare('SELECT * FROM dep_considerations WHERE dep_id = ? AND category = ? AND severity = ?').all(depId, category, severity) as Record<string, unknown>[];
    }
    if (category) {
      return this.db.prepare('SELECT * FROM dep_considerations WHERE dep_id = ? AND category = ?').all(depId, category) as Record<string, unknown>[];
    }
    if (severity) {
      return this.db.prepare('SELECT * FROM dep_considerations WHERE dep_id = ? AND severity = ?').all(depId, severity) as Record<string, unknown>[];
    }
    return this.db.prepare('SELECT * FROM dep_considerations WHERE dep_id = ?').all(depId) as Record<string, unknown>[];
  }

  findCachedDep(libraryName: string, language: string, versionRange: string): Record<string, unknown> | undefined {
    return this.db.prepare(
      'SELECT * FROM dep_version_cache WHERE library_name = ? AND language = ? AND version_range = ?'
    ).get(libraryName, language, versionRange) as Record<string, unknown> | undefined;
  }

  // --- Dependencies: Update/Delete ---

  updateDepIndexed(depId: string, indexed: boolean): void {
    this.db.prepare('UPDATE dep_registry SET is_indexed = ? WHERE id = ?').run(indexed ? 1 : 0, depId);
  }

  deleteDepData(depId: string): void {
    this.runInTransaction(() => {
      this.db.prepare('DELETE FROM dep_apis WHERE dep_id = ?').run(depId);
      this.db.prepare('DELETE FROM dep_patterns WHERE dep_id = ?').run(depId);
      this.db.prepare('DELETE FROM dep_considerations WHERE dep_id = ?').run(depId);
      this.db.prepare('DELETE FROM dep_version_cache WHERE dep_id = ?').run(depId);
      this.db.prepare('DELETE FROM dep_registry WHERE id = ?').run(depId);
    });
  }

  // --- Dependencies: Search ---

  searchDeps(query: string, language?: string, libraryName?: string): Record<string, unknown>[] {
    const words = query.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];
    const results: Record<string, unknown>[] = [];

    // Search dep_apis
    const apiFields = ['export_name', 'module', 'description', 'tags'];
    const apiResults = this.searchDepTable('dep_apis', 'apis', apiFields, words, language, libraryName);
    results.push(...apiResults);

    // Search dep_patterns
    const patFields = ['name', 'description'];
    const patResults = this.searchDepTable('dep_patterns', 'patterns', patFields, words, language, libraryName);
    results.push(...patResults);

    // Search dep_considerations
    const consFields = ['title', 'description'];
    const consResults = this.searchDepTable('dep_considerations', 'considerations', consFields, words, language, libraryName);
    results.push(...consResults);

    return results;
  }

  // --- Transaction helper ---

  runInTransaction<T>(fn: () => T): T {
    const t = this.db.transaction(fn);
    return t();
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
