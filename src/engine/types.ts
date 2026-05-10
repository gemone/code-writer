import { z } from 'zod';

// --- YAML Schema Validation ---

export const SeveritySchema = z.enum(['error', 'warn', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

// --- Sources Schema (for auto-indexing) ---

export const SourceEntrySchema = z.object({
  pattern: z.string().optional(),
  basePath: z.string().optional(),
  url: z.string().optional(),
  scope: z.string().optional(),
});
export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export const LanguageSourcesSchema = z.object({
  stdlib: z.array(SourceEntrySchema).optional(),
  docs: z.array(SourceEntrySchema).optional(),
});
export type LanguageSources = z.infer<typeof LanguageSourcesSchema>;

export const LanguageMetaInnerSchema = z.object({
  name: z.string(),
  version: z.string(),
  website: z.string().optional(),
  repo: z.string().optional(),
  description: z.string().optional(),
  paradigms: z.array(z.string()).optional(),
  typeSystem: z.union([z.record(z.string()), z.array(z.string()), z.record(z.unknown())]).optional(),
  runtime: z.string().optional(),
  packageManager: z.string().optional(),
  quickReference: z.record(z.union([z.string(), z.object({ description: z.string(), example: z.string().optional() })])).optional(),
  sources: LanguageSourcesSchema.optional(),
}).transform((meta) => ({
  ...meta,
  // Normalize quickReference values to strings
  quickReference: meta.quickReference
    ? Object.fromEntries(
        Object.entries(meta.quickReference).map(([k, v]) => [
          k,
          typeof v === 'string' ? v : `${v.description}${v.example ? '\n' + v.example : ''}`,
        ])
      )
    : undefined,
}));

// YAML may wrap in { language: { ... } } or be flat
export const LanguageMetaSchema = z.union([
  LanguageMetaInnerSchema,
  z.object({ language: LanguageMetaInnerSchema }).transform(v => v.language),
]);
export type LanguageMeta = z.infer<typeof LanguageMetaInnerSchema>;

export const StdlibMethodSchema = z.object({
  name: z.string(),
  signature: z.string().optional(),
  description: z.string(),
  returns: z.string().optional(),
  example: z.string().optional(),
  since: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type StdlibMethod = z.infer<typeof StdlibMethodSchema>;

export const StdlibModuleSchema = z.object({
  name: z.string(),
  module: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  methods: z.array(StdlibMethodSchema),
});
export type StdlibModule = z.infer<typeof StdlibModuleSchema>;

// Normalize function for TS-style stdlib: { stdlib: { Array: { description, methods } } }
function normalizeStdlib(raw: Record<string, unknown>): { modules: StdlibModule[] } {
  // Python format: { modules: [...] }
  if (Array.isArray(raw.modules)) {
    const modules: StdlibModule[] = (raw.modules as Record<string, unknown>[]).map((m: Record<string, unknown>) => ({
      name: (m.module || m.name) as string,
      module: m.module as string | undefined,
      category: (m.category || m.type) as string | undefined,
      description: m.description as string | undefined,
      methods: ((m.methods as Record<string, unknown>[] || []).map((method: Record<string, unknown>) => ({
        name: method.name as string,
        signature: method.signature as string | undefined,
        description: (method.description || '') as string,
        returns: method.returns as string | undefined,
        example: method.example as string | undefined,
        tags: method.tags as string[] | undefined,
      }))),
    }));
    return { modules };
  }

  // TS format: { stdlib: { ModuleName: { description, methods } } }
  const stdlib = raw.stdlib as Record<string, unknown> || raw;
  const modules: StdlibModule[] = [];
  for (const [key, value] of Object.entries(stdlib)) {
    if (key === 'version' || key === 'categories') continue;
    const mod = value as Record<string, unknown>;
    if (!mod || typeof mod !== 'object' || !Array.isArray(mod.methods)) continue;
    modules.push({
      name: key,
      description: mod.description as string,
      methods: (mod.methods as Record<string, unknown>[]).map((m: Record<string, unknown>) => ({
        name: m.name as string,
        signature: m.signature as string | undefined,
        description: (m.description || '') as string,
        returns: m.returns as string | undefined,
        example: m.example as string | undefined,
        tags: m.tags as string[] | undefined,
      })),
    });
  }
  return { modules };
}

export const StdlibSchema = z.union([
  // Python format: { modules: [...] }
  z.object({
    version: z.string().optional(),
    modules: z.array(StdlibModuleSchema),
  }),
  // TS format: { stdlib: { ModuleName: { ... } } } or flat { ModuleName: { ... } }
  z.record(z.unknown()).transform((raw) => {
    const normalized = normalizeStdlib(raw);
    return { modules: normalized.modules.map(m => StdlibModuleSchema.parse(m)) };
  }),
]);
export type StdlibData = { modules: StdlibModule[] };

export const SyntaxExampleSchema = z.object({
  code: z.string(),
  description: z.string().optional(),
});

export const SyntaxTopicSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  examples: z.array(SyntaxExampleSchema).optional(),
  antiPatterns: z.array(z.object({
    code: z.string(),
    reason: z.string(),
    fix: z.string().optional(),
  })).optional(),
});

export const SyntaxSectionSchema = z.object({
  name: z.string(),
  topics: z.array(SyntaxTopicSchema),
});

// Normalize TS-style syntax: { syntax: { section: { topic: { description, example } } } }
function normalizeSyntax(raw: Record<string, unknown>): { sections: { name: string; topics: { title: string; description?: string; examples?: { code: string; description?: string }[] }[] }[] } {
  // Python format: { sections: [...] }
  if (Array.isArray(raw.sections)) {
    return {
      sections: (raw.sections as Record<string, unknown>[]).map(s => ({
        name: (s.title || s.name) as string,
        topics: ((s.topics || []) as Record<string, unknown>[]).map(t => ({
          title: (t.title || t.topic) as string,
          description: t.description as string | undefined,
          examples: (t.examples as Record<string, unknown>[] | undefined)?.map(e => ({
            code: (e.code || e.example) as string,
            description: (e.title || e.description) as string | undefined,
          })),
        })),
      })),
    };
  }

  // TS format: { syntax: { sectionName: { topicName: { description, example } } } }
  const syntax = raw.syntax as Record<string, unknown> || raw;
  const sections: { name: string; topics: { title: string; description?: string; examples?: { code: string; description?: string }[] }[] }[] = [];

  for (const [sectionKey, sectionValue] of Object.entries(syntax)) {
    if (sectionKey === 'version') continue;
    const sectionObj = sectionValue as Record<string, unknown>;
    if (!sectionObj || typeof sectionObj !== 'object') continue;

    const topics: { title: string; description?: string; examples?: { code: string; description?: string }[] }[] = [];
    for (const [topicKey, topicValue] of Object.entries(sectionObj)) {
      const topicObj = topicValue as Record<string, unknown>;
      if (!topicObj || typeof topicObj !== 'object') continue;

      const examples: { code: string; description?: string }[] = [];
      if (topicObj.example) {
        examples.push({ code: topicObj.example as string });
      }
      if (topicObj.examples && Array.isArray(topicObj.examples)) {
        for (const ex of topicObj.examples) {
          if (typeof ex === 'string') {
            examples.push({ code: ex });
          } else {
            examples.push({ code: (ex as Record<string, unknown>).code as string, description: (ex as Record<string, unknown>).description as string | undefined });
          }
        }
      }

      topics.push({
        title: topicKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim(),
        description: topicObj.description as string | undefined,
        examples: examples.length > 0 ? examples : undefined,
      });
    }

    sections.push({
      name: sectionKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim(),
      topics,
    });
  }

  return { sections };
}

export const SyntaxSchema = z.union([
  // Python format: { sections: [...] }
  z.object({
    version: z.string().optional(),
    sections: z.array(SyntaxSectionSchema),
  }),
  // TS format: { syntax: { ... } } or flat { ... }
  z.record(z.unknown()).transform((raw) => {
    const normalized = normalizeSyntax(raw);
    return { sections: normalized.sections.map(s => SyntaxSectionSchema.parse(s)) };
  }),
]);
export type SyntaxData = { sections: { name: string; topics: { title: string; description?: string; examples?: { code: string; description?: string }[] }[] }[] };

export const ConventionExampleSchema = z.object({
  good: z.string().optional(),
  bad: z.string().optional(),
}).optional();

export const ConventionSchema = z.object({
  name: z.string(),
  rule: z.string(),
  severity: SeveritySchema.optional(),
  example: ConventionExampleSchema,
  rationale: z.string().optional(),
});
export type Convention = z.infer<typeof ConventionSchema>;

// Normalize convention from TS format (id, good/bad as direct fields) or Python format
function normalizeConvention(raw: Record<string, unknown>): Record<string, unknown> {
  const name = (raw.id || raw.name || raw.title) as string;

  // Handle TS conventions with nested "rules" (e.g., naming-conventions)
  let rule: string;
  if (raw.rule) {
    rule = raw.rule as string;
  } else if (raw.rules && typeof raw.rules === 'object') {
    // Flatten nested rules into a single description
    const rules = raw.rules as Record<string, Record<string, unknown>>;
    rule = Object.values(rules).map(r => r.description || r.convention).join('; ');
  } else {
    rule = (raw.description || '') as string;
  }

  const severity = raw.severity as string | undefined;
  const rationale = raw.rationale as string | undefined;

  // TS format: good/bad are direct string fields or { example: string }
  let example: { good?: string; bad?: string } | undefined;
  if (raw.good || raw.bad) {
    const goodVal = raw.good;
    const badVal = raw.bad;
    const good = typeof goodVal === 'string' ? goodVal
      : (goodVal && typeof goodVal === 'object') ? (goodVal as Record<string, unknown>).example as string
      : undefined;
    const bad = typeof badVal === 'string' ? badVal
      : (badVal && typeof badVal === 'object') ? (badVal as Record<string, unknown>).example as string
      : undefined;
    example = { good, bad };
  } else if (raw.examples && typeof raw.examples === 'object' && !Array.isArray(raw.examples)) {
    // Python format: { examples: { good: [...], bad: [...] } }
    const ex = raw.examples as Record<string, unknown>;
    const goodArr = ex.good;
    const badArr = ex.bad;
    example = {
      good: Array.isArray(goodArr) ? goodArr.join('\n') : goodArr as string | undefined,
      bad: Array.isArray(badArr) ? badArr.join('\n') : badArr as string | undefined,
    };
  } else if (raw.example && typeof raw.example === 'object') {
    const ex = raw.example as Record<string, unknown>;
    example = { good: ex.good as string | undefined, bad: ex.bad as string | undefined };
  } else if (raw.examples && Array.isArray(raw.examples)) {
    // Legacy array format
    const good = raw.examples.find((e: Record<string, unknown>) => e.type === 'good' || e.correct);
    const bad = raw.examples.find((e: Record<string, unknown>) => e.type === 'bad' || !e.correct);
    example = {
      good: good ? ((good as Record<string, unknown>).code as string) : undefined,
      bad: bad ? ((bad as Record<string, unknown>).code as string) : undefined,
    };
  }

  return { name, rule, severity, example, rationale };
}

export const ConventionsSchema = z.object({
  version: z.string().optional(),
  source: z.string().optional(),
  conventions: z.array(z.record(z.unknown()).transform(normalizeConvention).pipe(ConventionSchema)),
});
export type ConventionsData = z.infer<typeof ConventionsSchema>;

export const PatternSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  description: z.string(),
  when: z.string().optional(),
  example: z.string().optional(),
  relatedPatterns: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
});
export type Pattern = z.infer<typeof PatternSchema>;

// Normalize pattern from different YAML formats
function normalizePattern(raw: Record<string, unknown>): Record<string, unknown> {
  const whenRaw = raw.when || raw.whenToUse || raw.when_to_use;
  const when = Array.isArray(whenRaw) ? whenRaw.join('\n') : whenRaw;
  const exampleRaw = raw.example;
  const example = Array.isArray(exampleRaw) ? exampleRaw.join('\n') : typeof exampleRaw === 'string' ? exampleRaw : undefined;
  const description = raw.description || raw.intent;
  return {
    name: raw.name,
    category: raw.category,
    description,
    when,
    example,
    relatedPatterns: raw.relatedPatterns,
    languages: raw.languages,
  };
}

export const PatternsSchema = z.object({
  version: z.string().optional(),
  patterns: z.array(z.record(z.unknown()).transform(normalizePattern).pipe(PatternSchema)),
});
export type PatternsData = z.infer<typeof PatternsSchema>;

// --- Registry ---

export const LanguageEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  extensions: z.array(z.string()),
  aliases: z.array(z.string()).optional(),
  dataDir: z.string(),
  tags: z.array(z.string()).optional(),
});
export type LanguageEntry = z.infer<typeof LanguageEntrySchema>;

export const LanguageRegistrySchema = z.object({
  version: z.number(),
  languages: z.record(LanguageEntrySchema),
});
export type LanguageRegistry = z.infer<typeof LanguageRegistrySchema>;

// --- Aggregated ---

export interface LanguageData {
  meta: LanguageMeta;
  stdlib: StdlibModule[];
  syntax: SyntaxData;
  conventions: Convention[];
  patterns: Pattern[];
}

// --- Project Memory ---

export interface ProjectLanguage {
  language: string;
  fileCount: number;
  lastDetected: string;
}

// --- Search ---

export interface SearchOptions {
  language?: string;
  category?: 'stdlib' | 'syntax' | 'conventions' | 'patterns' | 'all';
  limit?: number;
}

export interface SearchResult {
  score: number;
  source: string;
  section: string;
  name: string;
  snippet: string;
  language: string;
}

export interface ConventionFilters {
  topic?: string;
  severity?: Severity | 'all';
}

export interface ComparisonResult {
  concept: string;
  languages: {
    language: string;
    sections: {
      source: string;
      content: string;
    }[];
  }[];
}

// --- Embedding Config ---

export interface EmbeddingConfig {
  provider: string;       // "local" | "openai://model" | "http://..."
  model?: string;         // model name for local provider
  apiKey?: string;        // optional API key
  baseUrl?: string;       // optional base URL override
  dimension?: number;     // embedding vector dimension (for HTTP providers)
  hfEndpoint?: string;    // HuggingFace mirror endpoint (e.g. "https://hf-mirror.com")
}

// --- Indexed Code Document ---

export interface CodeDocument {
  language: string;
  source: string;         // "stdlib" | "docs"
  module: string;
  name: string;
  signature: string;
  description: string;
  code: string;
  tags: string[];
}

export interface IndexedDocument extends CodeDocument {
  embedding: number[];
}

// --- Dependency Types ---

export const DepRegistrySchema = z.object({
  libraryName: z.string(),
  scope: z.string().optional(),
  resolvedVersion: z.string(),
  versionRange: z.string().optional(),
  language: z.string(),
  packageManager: z.string().optional(),
  description: z.string().optional(),
  sourceUrl: z.string().optional(),
  context7Id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type DepRegistry = z.infer<typeof DepRegistrySchema>;

export const DepApiSchema = z.object({
  module: z.string(),
  exportName: z.string(),
  exportKind: z.enum(['function', 'class', 'variable', 'type', 'interface']).default('function'),
  signature: z.string().optional(),
  description: z.string(),
  example: z.string().optional(),
  sinceVersion: z.string().optional(),
  deprecatedVersion: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sourceType: z.enum(['context7', 'manual', 'generated']).default('context7'),
});
export type DepApi = z.infer<typeof DepApiSchema>;

export const DepPatternSchema = z.object({
  name: z.string(),
  category: z.enum(['setup', 'usage', 'migration', 'testing', 'advanced']).optional(),
  description: z.string(),
  codeExample: z.string(),
  context: z.string().optional(),
  relatedPatterns: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type DepPattern = z.infer<typeof DepPatternSchema>;

export const DepConsiderationSchema = z.object({
  title: z.string(),
  category: z.enum(['breaking', 'deprecation', 'performance', 'security', 'migration', 'tip']),
  description: z.string(),
  affectedVersionRange: z.string().optional(),
  fixSuggestion: z.string().optional(),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  sourceUrl: z.string().optional(),
});
export type DepConsideration = z.infer<typeof DepConsiderationSchema>;

export interface DepFetchData {
  registry?: Partial<DepRegistry>;
  apis?: DepApi[];
  patterns?: DepPattern[];
  considerations?: DepConsideration[];
}

export interface DepSearchOptions {
  language?: string;
  libraryName?: string;
  category?: 'apis' | 'patterns' | 'considerations' | 'all';
  limit?: number;
}

export interface DepSearchResult {
  score: number;
  source: string;
  libraryName: string;
  version: string;
  section: string;
  name: string;
  snippet: string;
}

export interface DepDocument {
  library: string;
  version: string;
  language: string;
  source: string;
  module: string;
  name: string;
  signature: string;
  description: string;
  code: string;
  tags: string[];
}

export interface DepIndexedDocument extends DepDocument {
  embedding: number[];
}

export interface DetectedDependency {
  name: string;
  version: string;
  language: string;
  packageManager: string;
  scope?: string;
}

export interface ProjectDependencies {
  language: string;
  packageManager: string;
  manifestPath: string;
  dependencies: DetectedDependency[];
}

export interface DepRegistryRecord {
  id: string;
  library_name: string;
  scope: string | null;
  resolved_version: string;
  version_range: string | null;
  language: string;
  package_manager: string | null;
  description: string | null;
  source_url: string | null;
  context7_id: string | null;
  metadata_json: string | null;
  fetched_at: string;
  is_indexed: number;
}

export interface DepVersionCacheRecord {
  library_name: string;
  language: string;
  version_range: string;
  resolved_version: string;
  dep_id: string;
  cached_at: string;
}
