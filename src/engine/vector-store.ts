import path from 'node:path';
import fs from 'node:fs';
import { create, insertMultiple, search as oramaSearch } from '@orama/orama';
import { persistToFile, restoreFromFile } from '@orama/plugin-data-persistence/server';
import type { Orama } from '@orama/orama';
import { IndexedDocument, DepIndexedDocument } from './types.js';
import { APP_DIR } from './constants.js';

type CodeOrama = Orama<{
  language: 'string';
  source: 'string';
  module: 'string';
  name: 'string';
  signature: 'string';
  description: 'string';
  code: 'string';
  tags: 'string[]';
  embedding: `vector[${number}]`;
}>;

type DepCodeOrama = Orama<{
  library: 'string';
  version: 'string';
  language: 'string';
  source: 'string';
  module: 'string';
  name: 'string';
  signature: 'string';
  description: 'string';
  code: 'string';
  tags: 'string[]';
  embedding: `vector[${number}]`;
}>;

const DEFAULT_SIMILARITY = 0.2;
const INSERT_BATCH = 1000;

function sanitizeDepKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const ORAMA_SCHEMA = {
  language: 'string',
  source: 'string',
  module: 'string',
  name: 'string',
  signature: 'string',
  description: 'string',
  code: 'string',
  tags: 'string[]',
} as const;

const DEP_ORAMA_SCHEMA = {
  ...ORAMA_SCHEMA,
  library: 'string',
  version: 'string',
} as const;

export class VectorStore {
  private indexes = new Map<string, CodeOrama>();
  private depIndexes = new Map<string, DepCodeOrama>();
  private dimension: number;
  private dirty = new Set<string>();
  private depDirty = new Set<string>();
  private indexedLangs = new Set<string>();
  private indexedDeps = new Set<string>();

  constructor(dimension: number) {
    this.dimension = dimension;
  }

  private indexPath(lang: string): string {
    return path.join(APP_DIR, `orama-${lang}.msp`);
  }

  private depFilePath(safeKey: string): string {
    return path.join(APP_DIR, `orama-dep-${safeKey}.msp`);
  }

  private async createIndex(): Promise<CodeOrama> {
    return create({
      schema: { ...ORAMA_SCHEMA, embedding: `vector[${this.dimension}]` },
      components: { tokenizer: { language: 'english', stemming: true } },
    }) as unknown as CodeOrama;
  }

  private async createDepIndex(): Promise<DepCodeOrama> {
    return create({
      schema: { ...DEP_ORAMA_SCHEMA, embedding: `vector[${this.dimension}]` },
      components: { tokenizer: { language: 'english', stemming: true } },
    }) as unknown as DepCodeOrama;
  }

  private async getOrCreateIndex(lang: string): Promise<CodeOrama> {
    let db = this.indexes.get(lang);
    if (db) return db;

    const filePath = this.indexPath(lang);
    try {
      db = await restoreFromFile('binary', filePath) as CodeOrama;
    } catch {
      db = await this.createIndex();
    }

    this.indexes.set(lang, db);
    return db;
  }

  private async getOrCreateDepIndex(safeKey: string): Promise<DepCodeOrama> {
    let db = this.depIndexes.get(safeKey);
    if (db) return db;

    const filePath = this.depFilePath(safeKey);
    try {
      db = await restoreFromFile('binary', filePath) as DepCodeOrama;
    } catch {
      db = await this.createDepIndex();
    }

    this.depIndexes.set(safeKey, db);
    return db;
  }

  async loadOrInitialize(): Promise<void> {
    try {
      const files = fs.readdirSync(APP_DIR);
      for (const f of files) {
        const langMatch = f.match(/^orama-(.+)\.msp$/);
        if (langMatch && !f.startsWith('orama-dep-')) {
          this.indexedLangs.add(langMatch[1]);
          this.dirty.delete(langMatch[1]);
        }
        const depMatch = f.match(/^orama-dep-(.+)\.msp$/);
        if (depMatch) {
          this.indexedDeps.add(depMatch[1]);
          this.depDirty.delete(depMatch[1]);
        }
      }
    } catch { /* dir doesn't exist yet */ }
  }

  isIndexed(language: string): boolean {
    return this.indexes.has(language) || this.indexedLangs.has(language);
  }

  async indexLanguage(lang: string, documents: IndexedDocument[]): Promise<number> {
    this.indexes.delete(lang);
    const db = await this.createIndex();
    this.indexes.set(lang, db);

    if (documents.length === 0) return 0;

    for (let i = 0; i < documents.length; i += INSERT_BATCH) {
      const batch = documents.slice(i, i + INSERT_BATCH);
      await insertMultiple(db, batch.map(d => ({ ...d })) as any, 500);
    }

    this.dirty.add(lang);
    this.indexedLangs.add(lang);
    return documents.length;
  }

  async hybridSearch(
    queryText: string,
    queryVector: number[],
    options: {
      language?: string;
      source?: string;
      limit?: number;
      similarity?: number;
    } = {}
  ) {
    if (!options.language) {
      throw new Error('language is required for hybrid search');
    }
    const db = await this.getOrCreateIndex(options.language);

    const where: any = {};
    if (options.source) where.source = options.source;

    return oramaSearch(db, {
      mode: 'hybrid',
      term: queryText,
      vector: {
        value: queryVector,
        property: 'embedding',
      },
      similarity: options.similarity ?? DEFAULT_SIMILARITY,
      limit: options.limit ?? 10,
      includeVectors: false,
      ...(Object.keys(where).length > 0 ? { where } : {}),
    });
  }

  async textSearch(
    queryText: string,
    options: {
      language?: string;
      source?: string;
      limit?: number;
    } = {}
  ) {
    if (!options.language) {
      throw new Error('language is required for text search');
    }
    const db = await this.getOrCreateIndex(options.language);

    const where: any = {};
    if (options.source) where.source = options.source;

    return oramaSearch(db, {
      term: queryText,
      limit: options.limit ?? 10,
      includeVectors: false,
      ...(Object.keys(where).length > 0 ? { where } : {}),
    });
  }

  isDepIndexed(key: string): boolean {
    const safeKey = sanitizeDepKey(key);
    return this.depIndexes.has(safeKey) || this.indexedDeps.has(safeKey);
  }

  getIndexedDepKeys(): string[] {
    return [...this.indexedDeps];
  }

  async indexDependency(key: string, documents: DepIndexedDocument[]): Promise<number> {
    const safeKey = sanitizeDepKey(key);
    this.depIndexes.delete(safeKey);
    const db = await this.createDepIndex();
    this.depIndexes.set(safeKey, db);

    if (documents.length === 0) return 0;

    for (let i = 0; i < documents.length; i += INSERT_BATCH) {
      const batch = documents.slice(i, i + INSERT_BATCH);
      await insertMultiple(db, batch.map(d => ({ ...d })) as any, 500);
    }

    this.depDirty.add(safeKey);
    this.indexedDeps.add(safeKey);
    return documents.length;
  }

  async depHybridSearch(
    key: string,
    queryText: string,
    queryVector: number[],
    options: {
      language?: string;
      library?: string;
      limit?: number;
      similarity?: number;
    } = {}
  ) {
    const safeKey = sanitizeDepKey(key);
    const db = await this.getOrCreateDepIndex(safeKey);

    const where: any = {};
    if (options.language) where.language = options.language;
    if (options.library) where.library = options.library;

    return oramaSearch(db, {
      mode: 'hybrid',
      term: queryText,
      vector: {
        value: queryVector,
        property: 'embedding',
      },
      similarity: options.similarity ?? DEFAULT_SIMILARITY,
      limit: options.limit ?? 10,
      includeVectors: false,
      ...(Object.keys(where).length > 0 ? { where } : {}),
    });
  }

  async persist(): Promise<void> {
    const toPersist = [...this.dirty];
    this.dirty.clear();
    for (const lang of toPersist) {
      const db = this.indexes.get(lang);
      if (db) {
        await persistToFile(db, 'binary', this.indexPath(lang));
      }
    }

    const depToPersist = [...this.depDirty];
    this.depDirty.clear();
    for (const safeKey of depToPersist) {
      const db = this.depIndexes.get(safeKey);
      if (db) {
        await persistToFile(db, 'binary', this.depFilePath(safeKey));
      }
    }
  }
}

export { DEFAULT_SIMILARITY };
