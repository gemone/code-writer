import type { DatabaseManager } from './database.js';
import type { SearchOptions, SearchResult, ConventionFilters, ComparisonResult } from './types.js';

export class QueryEngine {
  constructor(private db: DatabaseManager) {}

  getMethod(lang: string, module: string, method?: string): Record<string, unknown>[] {
    return this.db.getStdlibMethods(lang, module, method);
  }

  search(query: string, options?: SearchOptions): SearchResult[] {
    const raw = this.db.searchAll(query, options?.language);
    const limit = options?.limit || 5;

    const results: SearchResult[] = raw.map(row => {
      const sourceType = row.source_type as string;
      let name = '';
      let snippet = '';
      let section = '';
      const language = (row.language_id as string) || '';

      switch (sourceType) {
        case 'stdlib':
          name = `${row.module}.${row.method}`;
          snippet = `${row.signature || ''}\n${row.description}`;
          section = 'stdlib';
          break;
        case 'syntax':
          name = row.topic as string;
          snippet = row.code as string;
          section = row.section as string;
          break;
        case 'conventions':
          name = row.name as string;
          snippet = row.rule as string;
          section = 'conventions';
          break;
        case 'patterns':
          name = row.name as string;
          snippet = row.description as string;
          section = 'patterns';
          break;
      }

      return {
        score: 1.0,
        source: sourceType,
        section,
        name,
        snippet,
        language,
      };
    });

    const category = options?.category || 'all';
    const filtered = category === 'all'
      ? results
      : results.filter(r => r.source === category);

    return filtered.slice(0, limit);
  }

  getConventions(lang?: string, filters?: ConventionFilters): Record<string, unknown>[] {
    return this.db.getConventions(lang, filters?.severity);
  }

  compare(concept: string, languages: string[]): ComparisonResult {
    const result: ComparisonResult = {
      concept,
      languages: [],
    };

    for (const lang of languages) {
      const sections: { source: string; content: string }[] = [];

      // Search conventions
      const convs = this.db.getConventions(lang);
      const matchingConvs = convs.filter(c =>
        (c.name as string).toLowerCase().includes(concept.toLowerCase()) ||
        (c.rule as string).toLowerCase().includes(concept.toLowerCase())
      );
      if (matchingConvs.length > 0) {
        sections.push({
          source: 'conventions',
          content: matchingConvs.map(c => `${c.name}: ${c.rule}`).join('\n'),
        });
      }

      // Search patterns
      const patterns = this.db.getPatterns(lang);
      const matchingPatterns = patterns.filter(p =>
        (p.name as string).toLowerCase().includes(concept.toLowerCase()) ||
        (p.description as string).toLowerCase().includes(concept.toLowerCase())
      );
      if (matchingPatterns.length > 0) {
        sections.push({
          source: 'patterns',
          content: matchingPatterns.map(p => `${p.name}: ${p.description}\n${p.example || ''}`).join('\n'),
        });
      }

      // Search syntax
      const syntaxResults = this.db.searchAll(concept, lang);
      const syntaxMatches = syntaxResults.filter(r => r.source_type === 'syntax');
      if (syntaxMatches.length > 0) {
        sections.push({
          source: 'syntax',
          content: syntaxMatches.map(s => `${s.topic}: ${s.code}`).join('\n'),
        });
      }

      result.languages.push({ language: lang, sections });
    }

    return result;
  }
}
