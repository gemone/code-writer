import type { DatabaseManager } from './database.js';
import type { DepSearchOptions, DepSearchResult } from './types.js';

export class DepQueryEngine {
  constructor(private db: DatabaseManager) {}

  search(query: string, options?: DepSearchOptions): DepSearchResult[] {
    const raw = this.db.searchDeps(query, options?.language, options?.libraryName);
    const limit = options?.limit || 5;

    const results: DepSearchResult[] = raw.map(row => {
      const sourceType = row.source_type as string;
      let name = '';
      let snippet = '';
      let section = '';

      switch (sourceType) {
        case 'apis':
          name = `${row.module}.${row.export_name}`;
          snippet = `${row.signature || ''}\n${row.description}`;
          section = 'apis';
          break;
        case 'patterns':
          name = row.name as string;
          snippet = row.description as string;
          section = 'patterns';
          break;
        case 'considerations':
          name = row.title as string;
          snippet = row.description as string;
          section = 'considerations';
          break;
      }

      return {
        score: 1.0,
        source: sourceType,
        libraryName: (row.library_name as string) || '',
        version: (row.resolved_version as string) || '',
        section,
        name,
        snippet,
      };
    });

    const category = options?.category || 'all';
    const filtered = category === 'all'
      ? results
      : results.filter(r => r.section === category);

    return filtered.slice(0, limit);
  }

  getDepLibrary(libraryName: string, language?: string): Record<string, unknown> | undefined {
    const records = this.db.getDepRegistryByName(libraryName, language);
    return records.length > 0 ? records[0] : undefined;
  }

  getDepApis(depId: string, module?: string, exportName?: string): Record<string, unknown>[] {
    return this.db.getDepApis(depId, module, exportName);
  }

  getDepPatterns(depId: string, category?: string): Record<string, unknown>[] {
    return this.db.getDepPatterns(depId, category);
  }

  getDepConsiderations(depId: string, category?: string, severity?: string): Record<string, unknown>[] {
    return this.db.getDepConsiderations(depId, category, severity);
  }

  isCached(libraryName: string, language: string, versionRange: string): boolean {
    return this.db.findCachedDep(libraryName, language, versionRange) !== undefined;
  }
}
