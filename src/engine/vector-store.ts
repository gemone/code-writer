import path from 'node:path';
import fs from 'node:fs';
import { create, insertMultiple, search as oramaSearch } from '@orama/orama';
import { persistToFile, restoreFromFile } from '@orama/plugin-data-persistence/server';
import type { Orama } from '@orama/orama';
import { IndexedDocument } from './types.js';
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

const DEFAULT_SIMILARITY = 0.2;
const INSERT_BATCH = 1000;

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

export class VectorStore {
  private indexes = new Map<string, CodeOrama>();
  private dimension: number;
  private dirty = new Set<string>();
  private indexedLangs = new Set<string>();

  constructor(dimension: number) {
    this.dimension = dimension;
  }

  private indexPath(lang: string): string {
    return path.join(APP_DIR, `orama-${lang}.msp`);
  }

  private async createIndex(): Promise<CodeOrama> {
    return create({
      schema: { ...ORAMA_SCHEMA, embedding: `vector[${this.dimension}]` },
      components: { tokenizer: { language: 'english', stemming: true } },
    }) as unknown as CodeOrama;
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

  async loadOrInitialize(): Promise<void> {
    try {
      const files = fs.readdirSync(APP_DIR);
      for (const f of files) {
        const match = f.match(/^orama-(.+)\.msp$/);
        if (match) {
          this.indexedLangs.add(match[1]);
          this.dirty.delete(match[1]);
        }
      }
    } catch { /* dir doesn't exist yet */ }
  }

  isIndexed(language: string): boolean {
    return this.indexes.has(language) || this.indexedLangs.has(language);
  }

  async indexLanguage(lang: string, documents: IndexedDocument[]): Promise<number> {
    // Discard old index entirely and create fresh — O(1) instead of O(n) removal
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

  async persist(): Promise<void> {
    const toPersist = [...this.dirty];
    this.dirty.clear();
    for (const lang of toPersist) {
      const db = this.indexes.get(lang);
      if (db) {
        await persistToFile(db, 'binary', this.indexPath(lang));
      }
    }
  }
}

export { DEFAULT_SIMILARITY };
