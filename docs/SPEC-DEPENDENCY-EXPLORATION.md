# Technical Specification: Dependency Library Exploration

**Plugin**: `@gemone/code-writer`
**Version**: 0.2.0 (target)
**Date**: 2026-05-10
**Status**: Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Schema](#2-database-schema)
3. [Type Definitions](#3-type-definitions)
4. [Version Detection](#4-version-detection)
5. [MCP Tools](#5-mcp-tools)
6. [Vector Store Extension](#6-vector-store-extension)
7. [Data Flow](#7-data-flow)
8. [Prompt Templates](#8-prompt-templates)
9. [Hook: dep-detector](#9-hook-dep-detector)
10. [Skills](#10-skills)
11. [File Manifest](#11-file-manifest)
12. [Implementation Order](#12-implementation-order)

---

## 1. Overview

This specification adds **dependency library exploration** to code-writer. The existing system handles *language-level* data (stdlib, syntax, conventions, patterns). This extension adds *library-level* data: third-party packages that projects depend on, with version-aware API references, usage patterns, and considerations.

### Scope

| Component | Description |
|-----------|-------------|
| `dep_explore` tool | Fetch dep docs from Context7, cache to SQLite, return structured API data |
| `dep_fetch` tool | Register dep data into DB (Phase 1/2 like `lang_fetch`) |
| `dep_search` tool | Version-aware search across cached dependency data |
| `dep-detector` hook | Auto-inject dep usage hints on file edit (like `api-detector`) |
| `/explore-dep` skill | Interactive dependency exploration workflow |
| `/review-deps` skill | Project dependency audit |
| DB schema | 5 new tables for dependency data |
| Vector store | Dependency-scoped Orama indexes |

### Design Principles

- Follow the existing `lang_*` patterns exactly (tool shape, DB CRUD, hook stdin/stdout)
- Reuse existing `VectorStore`, `EmbeddingProvider`, `DatabaseManager` infrastructure
- Dependency data is keyed by `(library_name, version_range)` -- not by language
- Context7 is the primary data source (already available as MCP server)
- Graceful degradation when Context7 is unavailable (SQLite-only fallback)

---

## 2. Database Schema

### 2.1 New Tables

The following DDL is appended to the `initialize()` method in `DatabaseManager`.

```sql
-- ============================================================
-- Table 1: dep_registry
-- Master record for each cached dependency library.
-- One row per (library, resolved_version).
-- ============================================================
CREATE TABLE IF NOT EXISTS dep_registry (
  id TEXT PRIMARY KEY,              -- "{scope}/{name}@{version}" e.g. "lodash/lodash@4.17.21"
  library_name TEXT NOT NULL,       -- "lodash", "express", "react"
  scope TEXT,                       -- npm scope or org (e.g. "babel" for @babel/core -> "babel")
  resolved_version TEXT NOT NULL,   -- Exact resolved version e.g. "4.17.21"
  version_range TEXT,               -- Original semver range from manifest e.g. "^4.17.0"
  language TEXT NOT NULL,           -- Host language: "typescript", "python", "go", "rust"
  package_manager TEXT,             -- "npm", "pip", "go", "cargo"
  description TEXT,
  source_url TEXT,                  -- Context7 library ID or docs URL
  context7_id TEXT,                 -- Context7-compatible library ID e.g. "/lodash/lodash"
  metadata_json TEXT,               -- Arbitrary metadata (license, repo, etc.)
  fetched_at TEXT NOT NULL,         -- ISO timestamp of last fetch
  is_indexed INTEGER NOT NULL DEFAULT 0  -- 1 if vector-indexed
);

CREATE INDEX IF NOT EXISTS idx_dep_registry_name ON dep_registry(library_name);
CREATE INDEX IF NOT EXISTS idx_dep_registry_lang ON dep_registry(language);
CREATE INDEX IF NOT EXISTS idx_dep_registry_context7 ON dep_registry(context7_id);

-- ============================================================
-- Table 2: dep_apis
-- API surface: functions, classes, methods, types exported by a dep.
-- ============================================================
CREATE TABLE IF NOT EXISTS dep_apis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dep_id TEXT NOT NULL,             -- FK -> dep_registry.id
  module TEXT NOT NULL,             -- Export module/path e.g. "express", "express.Router"
  export_name TEXT NOT NULL,        -- "get", "post", "Router", "use"
  export_kind TEXT NOT NULL DEFAULT 'function', -- "function" | "class" | "variable" | "type" | "interface"
  signature TEXT,                   -- "(path: string, handler: RequestHandler): Router"
  description TEXT NOT NULL,
  example TEXT,
  since_version TEXT,               -- Version this API was introduced
  deprecated_version TEXT,          -- Version this API was deprecated (NULL = not deprecated)
  tags TEXT,                        -- JSON array of tags
  source_type TEXT NOT NULL DEFAULT 'context7', -- "context7" | "manual" | "generated"
  FOREIGN KEY (dep_id) REFERENCES dep_registry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dep_apis_dep ON dep_apis(dep_id);
CREATE INDEX IF NOT EXISTS idx_dep_apis_module ON dep_apis(dep_id, module);
CREATE INDEX IF NOT EXISTS idx_dep_apis_name ON dep_apis(export_name);
CREATE INDEX IF NOT EXISTS idx_dep_apis_kind ON dep_apis(export_kind);

-- ============================================================
-- Table 3: dep_patterns
-- Common usage patterns and code examples for a dependency.
-- ============================================================
CREATE TABLE IF NOT EXISTS dep_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dep_id TEXT NOT NULL,
  name TEXT NOT NULL,               -- "middleware chaining", "error handling"
  category TEXT,                    -- "setup" | "usage" | "migration" | "testing" | "advanced"
  description TEXT NOT NULL,
  code_example TEXT NOT NULL,
  context TEXT,                     -- When to use this pattern
  related_patterns TEXT,            -- JSON array of related pattern names
  tags TEXT,
  FOREIGN KEY (dep_id) REFERENCES dep_registry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dep_patterns_dep ON dep_patterns(dep_id);
CREATE INDEX IF NOT EXISTS idx_dep_patterns_category ON dep_patterns(dep_id, category);

-- ============================================================
-- Table 4: dep_considerations
-- Version-specific considerations: breaking changes, migration notes,
-- performance notes, security advisories.
-- ============================================================
CREATE TABLE IF NOT EXISTS dep_considerations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dep_id TEXT NOT NULL,
  title TEXT NOT NULL,              -- "Breaking: callback -> promise API in v5"
  category TEXT NOT NULL,           -- "breaking" | "deprecation" | "performance" | "security" | "migration" | "tip"
  description TEXT NOT NULL,
  affected_version_range TEXT,      -- Semver range of affected versions e.g. ">=5.0.0"
  fix_suggestion TEXT,              -- Suggested fix or migration path
  severity TEXT,                    -- "critical" | "warning" | "info"
  source_url TEXT,
  FOREIGN KEY (dep_id) REFERENCES dep_registry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dep_considerations_dep ON dep_considerations(dep_id);
CREATE INDEX IF NOT EXISTS idx_dep_considerations_severity ON dep_considerations(severity);
CREATE INDEX IF NOT EXISTS idx_dep_considerations_category ON dep_considerations(dep_id, category);

-- ============================================================
-- Table 5: dep_version_cache
-- Tracks which (library, version) combos have been fetched and cached.
-- Enables "is this dep already cached?" checks without scanning dep_registry.
-- ============================================================
CREATE TABLE IF NOT EXISTS dep_version_cache (
  library_name TEXT NOT NULL,
  language TEXT NOT NULL,
  version_range TEXT NOT NULL,
  resolved_version TEXT NOT NULL,
  dep_id TEXT NOT NULL,             -- FK -> dep_registry.id
  cached_at TEXT NOT NULL,
  PRIMARY KEY (library_name, language, version_range)
);

CREATE INDEX IF NOT EXISTS idx_dep_version_cache_lang ON dep_version_cache(language);
```

### 2.2 New Methods on DatabaseManager

These methods are added to `DatabaseManager` in `src/engine/database.ts`.

```typescript
// --- Dependency Registry ---

insertDepRegistry(params: {
  id: string;
  libraryName: string;
  scope?: string;
  resolvedVersion: string;
  versionRange?: string;
  language: string;
  PackageManager?: string;
  description?: string;
  sourceUrl?: string;
  context7Id?: string;
  metadata?: Record<string, unknown>;
  fetchedAt: string;
}): void

getDepRegistry(id: string): DepRegistryRecord | undefined

getDepRegistryByName(libraryName: string, language?: string): DepRegistryRecord[]

findDepRegistry(libraryName: string, versionRange: string, language: string): DepRegistryRecord | undefined

updateDepIndexed(depId: string, indexed: boolean): void

deleteDepData(depId: string): void  // Cascades to apis, patterns, considerations

// --- Dependency APIs ---

insertDepApi(params: {
  depId: string;
  module: string;
  exportName: string;
  exportKind: string;
  signature?: string;
  description: string;
  example?: string;
  sinceVersion?: string;
  deprecatedVersion?: string;
  tags?: string[];
  sourceType?: string;
}): void

getDepApis(depId: string, module?: string, exportName?: string): Record<string, unknown>[]

searchDepApis(query: string, depId?: string, language?: string): Record<string, unknown>[]

// --- Dependency Patterns ---

insertDepPattern(params: {
  depId: string;
  name: string;
  category?: string;
  description: string;
  codeExample: string;
  context?: string;
  relatedPatterns?: string[];
  tags?: string[];
}): void

getDepPatterns(depId: string, category?: string): Record<string, unknown>[]

// --- Dependency Considerations ---

insertDepConsideration(params: {
  depId: string;
  title: string;
  category: string;
  description: string;
  affectedVersionRange?: string;
  fixSuggestion?: string;
  severity?: string;
  sourceUrl?: string;
}): void

getDepConsiderations(depId: string, category?: string, severity?: string): Record<string, unknown>[]

// --- Dependency Version Cache ---

insertDepVersionCache(params: {
  libraryName: string;
  language: string;
  versionRange: string;
  resolvedVersion: string;
  depId: string;
}): void

findCachedDep(libraryName: string, language: string, versionRange: string): DepVersionCacheRecord | undefined

// --- Dependency Search (SQLite LIKE, like searchAll but for deps) ---

searchDeps(query: string, language?: string, libraryName?: string): Record<string, unknown>[]
```

#### Method Signatures (TypeScript)

```typescript
interface DepRegistryRecord {
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

interface DepVersionCacheRecord {
  library_name: string;
  language: string;
  version_range: string;
  resolved_version: string;
  dep_id: string;
  cached_at: string;
}
```

The `searchDeps` method follows the same pattern as `searchAll` -- builds `LIKE` clauses against relevant fields (`export_name`, `module`, `description`, `tags` in `dep_apis`; `name`, `description` in `dep_patterns`), with AND-then-OR fallback.

---

## 3. Type Definitions

New types are added to `src/engine/types.ts`.

```typescript
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

// Aggregated dependency data for dep_fetch Phase 2
export interface DepFetchData {
  registry?: Partial<DepRegistry>;
  apis?: DepApi[];
  patterns?: DepPattern[];
  considerations?: DepConsideration[];
}

// Dependency search options
export interface DepSearchOptions {
  language?: string;
  libraryName?: string;
  category?: 'apis' | 'patterns' | 'considerations' | 'all';
  limit?: number;
}

export interface DepSearchResult {
  score: number;
  source: string;         // "api" | "pattern" | "consideration"
  libraryName: string;
  version: string;
  section: string;        // module or category
  name: string;
  snippet: string;
}

// Dependency vector document (for Orama indexing)
export interface DepDocument {
  library: string;        // "express"
  version: string;        // "4.18.2"
  language: string;       // "typescript"
  source: string;         // "dep-api" | "dep-pattern"
  module: string;         // "express" | "express.Router"
  name: string;           // "get" | "middleware chaining"
  signature: string;
  description: string;
  code: string;
  tags: string[];
}

export interface DepIndexedDocument extends DepDocument {
  embedding: number[];
}

// Version detection result
export interface DetectedDependency {
  name: string;
  version: string;        // Resolved exact version or range
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
```

---

## 4. Version Detection

### 4.1 New File: `src/engine/version-detector.ts`

Parses project dependency manifests to detect installed versions.

```typescript
export function detectProjectDependencies(
  projectRoot: string
): ProjectDependencies[]
```

Returns one `ProjectDependencies` per detected manifest file.

### 4.2 Parse Logic per Manifest Type

#### `package.json` (Node.js / TypeScript)

```typescript
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
```

- Read `package.json`, extract both `dependencies` and `devDependencies`
- `language`: `"typescript"` if `tsconfig.json` exists nearby, else `"javascript"`
- `packageManager`: `"npm"` (or `"pnpm"`/`"yarn"` if lockfile detected)
- `version`: raw semver range from manifest (e.g., `"^4.17.21"`)
- If `package-lock.json` or `node_modules/<pkg>/package.json` exists, resolve to exact version

#### `pyproject.toml` (Python)

```python
# [project]
# dependencies = ["flask>=3.0", "requests~=2.31"]
```

- Parse with a simple TOML parser or regex for `[project]` section's `dependencies` array
- `language`: `"python"`, `packageManager`: `"pip"`
- Extract name and version range from PEP 508 format: `"name>=1.0,<2.0"` -> `{name: "name", version: ">=1.0,<2.0"}`

#### `requirements.txt` (Python fallback)

```
flask>=3.0
requests~=2.31
```

- Parse line by line, strip comments and `-r` includes
- `language`: `"python"`, `packageManager`: `"pip"`

#### `go.mod` (Go)

```
module github.com/user/project

go 1.22

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/go-sql-driver/mysql v1.7.1
)
```

- Parse `require (...)` block
- `language`: `"go"`, `packageManager`: `"go"`
- `version`: strip the `v` prefix or keep as-is
- `scope`: everything before the last path segment (e.g., `"github.com/gin-gonic"` for `"github.com/gin-gonic/gin"`)

#### `Cargo.toml` (Rust)

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

- Parse `[dependencies]` section
- `language`: `"rust"`, `packageManager`: `"cargo"`
- Handle both shorthand (`"1.0"`) and table (`{ version = "1.0" }`) formats

### 4.3 Version Resolution

After parsing the manifest, attempt to resolve to an exact version:

| Ecosystem | Resolution source |
|-----------|------------------|
| npm | `package-lock.json` -> `node_modules/<pkg>/package.json` -> fallback to range |
| pip | `requirements.txt` (pinned) -> `pip show <pkg>` (if available) -> fallback to range |
| go | `go.sum` (contains exact hashes/versions) -> fallback to `go.mod` version |
| cargo | `Cargo.lock` -> fallback to `Cargo.toml` range |

The resolved version is stored in `dep_registry.resolved_version`; the original range is stored in `dep_registry.version_range`.

---

## 5. MCP Tools

### 5.1 `dep_explore`

Fetches dependency documentation from Context7, caches to SQLite, and returns structured API data. This is the primary entry point for exploring a dependency.

```typescript
// File: src/tools/dep-explore.ts

export function createDepExploreTool(
  db: DatabaseManager,
  vectorStore: VectorStore | null,
  embedding: EmbeddingProvider | null,
): Tool
```

#### Input Schema

```typescript
{
  type: 'object',
  properties: {
    library: {
      type: 'string',
      description: "Library name (e.g., 'express', 'react', 'lodash')"
    },
    version: {
      type: 'string',
      description: "Version or semver range (e.g., '4.18.2', '^5.0.0'). Auto-detected if omitted."
    },
    language: {
      type: 'string',
      description: "Host language (e.g., 'typescript', 'python'). Auto-detected from project if omitted."
    },
    project_path: {
      type: 'string',
      description: "Project root path for auto-detection. Defaults to cwd."
    },
    depth: {
      type: 'string',
      enum: ['summary', 'full'],
      default: 'summary',
      description: "summary: top-level API listing. full: detailed APIs with examples."
    },
    force: {
      type: 'boolean',
      default: false,
      description: "Re-fetch even if cached data exists."
    }
  },
  required: ['library'],
}
```

#### Handler Logic

```
1. Resolve version and language:
   - If version/language not provided, call detectProjectDependencies(project_path)
   - Find matching dependency in detected deps
   - Fall back to version="latest", language deduced from project

2. Check cache:
   - dep_version_cache lookup by (library_name, language, version_range)
   - If cached and !force:
     - Return cached dep_apis + dep_patterns + dep_considerations
     - Render as markdown (like lang_ref output)

3. Fetch from Context7 (via internal HTTP call, not MCP tool):
   - POST https://context7.com/api/v1/resolve { query: library }
     -> get context7Id
   - POST https://context7.com/api/v1/query { libraryId, query, tokens: 8000 }
     -> get documentation text + code snippets
   - Parse response into structured DepApi[], DepPattern[], DepConsideration[]

4. Store in SQLite:
   - Insert into dep_registry
   - Insert into dep_apis, dep_patterns, dep_considerations
   - Insert into dep_version_cache

5. Return formatted markdown:
   - API surface overview
   - Key patterns (top 3-5)
   - Considerations (breaking changes, deprecations)
```

#### Output Format (summary mode)

```markdown
# express 4.18.2 (TypeScript)

> Fast, unopinionated, minimalist web framework for Node.js.

## API Surface

| Module | Export | Kind | Signature |
|--------|--------|------|-----------|
| express | `json()` | function | `(options?: JsonOptions): Middleware` |
| express | `Router()` | function | `(options?: RouterOptions): Router` |
| express.Router | `get()` | function | `(path: string, ...handlers): Router` |
| express.Router | `use()` | function | `(path: string, ...handlers): Router` |
| express | `static()` | function | `(root: string, options?): Middleware` |

## Common Patterns

### Middleware Chaining
```ts
app.use(cors());
app.use(express.json());
app.use('/api', router);
```

## Considerations

- **Breaking**: `app.listen()` callback removed in v5. Use promise or server event.
- **Security**: Enable `trust proxy` setting carefully. See express security best practices.

Use `dep_search(library: "express", query: "...")` for deeper search.
Use `dep_explore(library: "express", depth: "full")` for full API details.
```

### 5.2 `dep_fetch`

Registers dependency data into the database. Follows the same Phase 1/2 pattern as `lang_fetch`.

```typescript
// File: src/tools/dep-fetch.ts

export function createDepFetchTool(
  db: DatabaseManager,
  loader: LanguageLoader,
): Tool
```

#### Input Schema

```typescript
{
  type: 'object',
  properties: {
    library: {
      type: 'string',
      description: "Library name (e.g., 'express', 'react')"
    },
    version: {
      type: 'string',
      description: "Exact version (e.g., '4.18.2')"
    },
    language: {
      type: 'string',
      description: "Host language"
    },
    context7_id: {
      type: 'string',
      description: "Context7-compatible library ID (e.g., '/expressjs/express'). Auto-resolved if omitted."
    },
    force: {
      type: 'boolean',
      default: false,
      description: 'Re-fetch even if data already exists'
    },
    data: {
      type: 'object',
      description: 'Phase 2: populated data (apis, patterns, considerations) to write',
      properties: {
        apis: { type: 'array', items: { type: 'object' } },
        patterns: { type: 'array', items: { type: 'object' } },
        considerations: { type: 'array', items: { type: 'object' } },
        metadata: { type: 'object' },
      }
    }
  },
  required: ['library'],
}
```

#### Handler Logic

```
Phase 1 (no data parameter):
  1. Check if library already cached
  2. If exists and !force, return cached info
  3. Resolve Context7 library ID (if not provided)
  4. Return instructions for populating data:
     - Context7 resolve-library-id + query-docs queries
     - Suggested search queries for APIs, patterns, considerations
  5. Return Phase 2 call template

Phase 2 (data parameter provided):
  1. Generate dep_id: "{scope}/{name}@{version}"
  2. Insert into dep_registry
  3. Insert data.apis into dep_apis (batch)
  4. Insert data.patterns into dep_patterns (batch)
  5. Insert data.considerations into dep_considerations (batch)
  6. Insert into dep_version_cache
  7. Return summary of what was stored
```

### 5.3 `dep_search`

Version-aware search across cached dependency data. Follows the SQLite + vector hybrid pattern from `lang_search`.

```typescript
// File: src/tools/dep-search.ts

export function createDepSearchTool(
  db: DatabaseManager,
  vectorStore: VectorStore | null,
  embedding: EmbeddingProvider | null,
): Tool
```

#### Input Schema

```typescript
{
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search query (API name, pattern, concept)'
    },
    library: {
      type: 'string',
      description: "Restrict to a specific library (e.g., 'express')"
    },
    language: {
      type: 'string',
      description: "Restrict to a host language"
    },
    category: {
      type: 'string',
      enum: ['apis', 'patterns', 'considerations', 'all'],
      default: 'all'
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 20,
      default: 5
    }
  },
  required: ['query'],
}
```

#### Handler Logic

```
1. SQLite search:
   - db.searchDeps(query, language, library)
   - Filter by category
   - Limit results

2. If SQLite fills limit, return immediately

3. Vector search fallback (if vectorStore available):
   - Embed query
   - vectorStore.depHybridSearch(query, queryVector, { library, language, limit })
   - Deduplicate against SQLite results
   - Render hits

4. Merge and return formatted markdown
```

---

## 6. Vector Store Extension

### 6.1 Dependency-Scoped Indexes

The existing `VectorStore` uses one Orama index per *language* (`orama-{lang}.msp`). For dependencies, we add one index per *library*, keyed as `orama-dep-{library}@{version}.msp`.

#### New Schema for Dependency Documents

```typescript
// In vector-store.ts

const DEP_ORAMA_SCHEMA = {
  library: 'string',
  version: 'string',
  language: 'string',
  source: 'string',       // "dep-api" | "dep-pattern"
  module: 'string',
  name: 'string',
  signature: 'string',
  description: 'string',
  code: 'string',
  tags: 'string[]',
} as const;

type DepOrama = Orama<{
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
```

#### New Methods on VectorStore

```typescript
// Index a dependency's documents
async indexDependency(
  depKey: string,         // "express@4.18.2"
  documents: DepIndexedDocument[],
): Promise<number>

// Hybrid search within dependency indexes
async depHybridSearch(
  queryText: string,
  queryVector: number[],
  options: {
    library?: string;     // "express"
    language?: string;    // "typescript"
    limit?: number;
    similarity?: number;
  },
): Promise<{ hits: Array<{ document: any; score: number }> }>

// Check if a dependency is indexed
isDepIndexed(depKey: string): boolean

// Persist all dirty dependency indexes
// (called alongside existing persist())
```

#### Index Key Convention

```typescript
private depIndexPath(depKey: string): string {
  // depKey is "express@4.18.2" or "lodash@4.17.21"
  return path.join(APP_DIR, `orama-dep-${depKey}.msp`);
}
```

#### depHybridSearch Implementation

When `library` is specified, search only that index. When `language` is specified without `library`, search all dep indexes matching that language. When neither is specified, search all dep indexes (expensive, used as last resort).

```typescript
async depHybridSearch(
  queryText: string,
  queryVector: number[],
  options: { library?: string; language?: string; limit?: number; similarity?: number }
): Promise<{ hits: Array<{ document: any; score: number }> }> {
  const limit = options.limit ?? 10;
  const similarity = options.similarity ?? DEFAULT_SIMILARITY;

  let indexesToSearch: DepOrama[];

  if (options.library) {
    // Find indexes matching library name (any version)
    indexesToSearch = [...this.depIndexes.entries()]
      .filter(([key]) => key.startsWith(options.library + '@'))
      .map(([, db]) => db);
  } else if (options.language) {
    // Search all dep indexes for this language
    // Requires loading index metadata or filtering by convention
    indexesToSearch = [...this.depIndexes.values()];
  } else {
    indexesToSearch = [...this.depIndexes.values()];
  }

  const allHits: Array<{ document: any; score: number }> = [];
  for (const db of indexesToSearch) {
    const results = await oramaSearch(db, {
      mode: 'hybrid',
      term: queryText,
      vector: { value: queryVector, property: 'embedding' },
      similarity,
      limit,
      includeVectors: false,
      where: options.language ? { language: options.language } : undefined,
    });
    allHits.push(...results.hits.map(h => ({ document: h.document, score: h.score })));
  }

  // Sort by score descending, deduplicate by name, take limit
  allHits.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  return {
    hits: allHits.filter(h => {
      const key = `${h.document.library}:${h.document.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit),
  };
}
```

---

## 7. Data Flow

### 7.1 Context7 to SQLite to Vector Store

```
User calls dep_explore(library: "express", version: "^4.18.0")
  |
  v
[1] Version Detection
    detectProjectDependencies(cwd)
    -> finds package.json, resolves "express" -> "4.18.2"
  |
  v
[2] Cache Check
    dep_version_cache: (express, typescript, ^4.18.0) -> hit?
    If hit: return cached data from dep_apis/dep_patterns/dep_considerations
  |
  v
[3] Context7 Resolve
    POST https://context7.com/api/v1/resolve
    { query: "express web framework node.js" }
    -> context7Id: "/expressjs/express"
  |
  v
[4] Context7 Query (3 parallel requests)
    a) APIs:     query-docs(libraryId, query="express API reference methods functions", tokens=8000)
    b) Patterns: query-docs(libraryId, query="express usage patterns examples middleware routing", tokens=6000)
    c) Considerations: query-docs(libraryId, query="express breaking changes migration deprecation", tokens=4000)
  |
  v
[5] Parse Context7 Response
    Each response contains structured text + code snippets.
    Parse into typed arrays:
    - DepApi[] from API response
    - DepPattern[] from patterns response
    - DepConsideration[] from considerations response
  |
  v
[6] Store in SQLite
    BEGIN TRANSACTION
      INSERT dep_registry (id="expressjs/express@4.18.2", ...)
      INSERT dep_apis (batch, ~50-200 rows)
      INSERT dep_patterns (batch, ~5-20 rows)
      INSERT dep_considerations (batch, ~0-10 rows)
      INSERT dep_version_cache
    COMMIT
  |
  v
[7] Vector Index (async, non-blocking)
    If vectorStore available:
      Convert dep_apis + dep_patterns -> DepDocument[]
      Generate embeddings (batch)
      vectorStore.indexDependency("express@4.18.2", documents)
      db.updateDepIndexed(depId, true)
  |
  v
[8] Return formatted markdown to user
```

### 7.2 Search Flow (dep_search)

```
User calls dep_search(query: "error handling middleware", library: "express")
  |
  v
[1] SQLite Search
    searchDeps("error handling middleware", language?, "express")
    -> searches dep_apis.description, dep_patterns.name/description, dep_considerations.title/description
    -> returns top N results
  |
  v
[2] If SQLite < limit, Vector Search
    embed("error handling middleware")
    depHybridSearch(queryText, queryVector, { library: "express" })
    -> searches Orama dep index for express
    -> deduplicates against SQLite results
  |
  v
[3] Merge results, render markdown
```

### 7.3 Hook Flow (dep-detector)

```
User edits file -> Claude Code fires PostToolUse hook
  |
  v
[1] Hook reads stdin JSON
    { tool_name: "Write", tool_input: { file_path: "src/app.ts", content: "..." } }
  |
  v
[2] Extract imports from file content
    AST-based extraction (reuse existing extractImports from ast.ts)
    -> ["express", "cors", "helmet"]
  |
  v
[3] Filter to third-party deps (exclude stdlib/modules in MODULE_ALIASES)
  |
  v
[4] Look up cached dep data
    For each import, query dep_apis(depId, import_name, limit=3)
  |
  v
[5] Build reminder and write to stdout
    <system-reminder>
    Detected dependency usage in app.ts. Reference:
    **express.json()** `(options?): Middleware` - Parse JSON bodies...
    Use `dep_explore(library: "express")` for full API reference.
    </system-reminder>
```

---

## 8. Prompt Templates

### 8.1 Platform-Specific Embedding Prompts

Embedding quality improves when the text is preprocessed with context. This section defines YAML templates stored in `data/_shared/dep-embedding-prompts.yaml`.

```yaml
# data/_shared/dep-embedding-prompts.yaml
version: 1

# Templates are used to construct the text that gets embedded.
# Variables: {name}, {signature}, {description}, {module}, {library}, {version}, {language}
# The embedding text is built by filling the template, then embedded.

templates:
  claude:
    # Claude works best with structured, documentation-style text
    api: |
      {library} {version} ({language}):
      {module}.{name}{signature}
      {description}
    pattern: |
      {library} pattern: {name}
      {description}
      Context: {context}
    consideration: |
      {library} {version} note: {title} [{severity}]
      {description}
      Fix: {fix_suggestion}

  opencode:
    # OpenCode benefits from more concise, keyword-heavy text
    api: |
      {library} {module}.{name} {signature}
      {description} {tags}
    pattern: |
      {library} {name} pattern
      {description}
    consideration: |
      {library} {title} {severity}
      {description}

  default:
    # Fallback: same as claude
    api: |
      {library} {version} ({language}):
      {module}.{name}{signature}
      {description}
    pattern: |
      {library} pattern: {name}
      {description}
      Context: {context}
    consideration: |
      {library} {version} note: {title} [{severity}]
      {description}
      Fix: {fix_suggestion}

# Detection: which template set to use
# The platform is detected from the MCP client name in the server handshake.
platform_detection:
  claude:
    - "claude-code"
    - "claude"
  opencode:
    - "opencode"
```

### 8.2 Template Usage in Indexing

When indexing dependency documents for vector search, the template is applied to produce the text that gets embedded:

```typescript
function buildEmbeddingText(
  doc: DepDocument,
  platform: 'claude' | 'opencode' | 'default',
  templateType: 'api' | 'pattern' | 'consideration',
): string {
  const templates = loadEmbeddingTemplates();  // Cached YAML parse
  const tmpl = templates[platform]?.[templateType] || templates.default[templateType];
  return tmpl
    .replace('{library}', doc.library)
    .replace('{version}', doc.version)
    .replace('{language}', doc.language)
    .replace('{module}', doc.module)
    .replace('{name}', doc.name)
    .replace('{signature}', doc.signature)
    .replace('{description}', doc.description)
    .replace('{tags}', doc.tags.join(' '))
    .replace('{context}', doc.code)
    .replace('{severity}', '')
    .replace('{fix_suggestion}', '')
    .trim();
}
```

---

## 9. Hook: dep-detector

### 9.1 File: `src/hooks/dep-detector.ts`

Follows the exact same stdin/stdout pattern as `api-detector.ts`.

#### stdin JSON Format (input)

```typescript
interface DepDetectorInput {
  tool_name?: string;        // "Write", "Edit", "MultiEdit"
  tool_input?: {
    file_path?: string;
    content?: string;
  };
}
```

Only triggers on file-editing tools: `Write`, `Edit`, `MultiEdit`.

#### stdout Format (output)

```typescript
// Success: writes <system-reminder> block to stdout
// Failure: exits silently (exit code 0, no output)
```

#### Logic

```typescript
const SUPPORTED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

const input = fs.readFileSync(0, 'utf-8');
try {
  const data: DepDetectorInput = JSON.parse(input);
  const toolName = data.tool_name;
  if (!toolName || !SUPPORTED_TOOLS.has(toolName)) { process.exit(0); }

  const filePath = data.tool_input?.file_path;
  if (!filePath) { process.exit(0); }

  const ext = path.extname(filePath).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (!lang || !isSupported(lang)) { process.exit(0); }

  let content = data.tool_input?.content;
  if (!content && fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }
  if (!content) { process.exit(0); }

  // Extract imports
  const imports = extractImports(lang, content);
  if (imports.length === 0) { process.exit(0); }

  // Filter: keep only third-party deps (not stdlib/relative)
  const aliases = MODULE_ALIASES[lang] || {};
  const thirdParty = imports
    .map(i => ({
      module: aliases[i.module] || i.module,
      names: i.names,
    }))
    .filter(i => !i.module.startsWith('.') && !i.module.startsWith('/'))
    .filter(i => !isStdlibModule(i.module, lang));  // NEW: exclude known stdlib

  if (thirdParty.length === 0) { process.exit(0); }

  // Look up cached dep data
  const db = new DatabaseManager();
  const entries: { library: string; module: string; export: string; signature: string; description: string }[] = [];

  for (const imp of thirdParty) {
    // Find dep by library name
    const regs = db.getDepRegistryByName(imp.module, lang);
    if (regs.length === 0) continue;
    const depId = regs[0].id;

    // If named imports, look up specific exports
    if (imp.names.length > 0 && imp.names[0] !== '*') {
      for (const name of imp.names.slice(0, 3)) {
        const apis = db.getDepApis(depId, undefined, name);
        for (const api of apis.slice(0, 2)) {
          entries.push({
            library: imp.module,
            module: api.module as string,
            export: api.export_name as string,
            signature: (api.signature || '') as string,
            description: (api.description || '') as string,
          });
        }
      }
    } else {
      // Bare import: show top-level module APIs
      const apis = db.getDepApis(depId, imp.module);
      for (const api of apis.slice(0, 3)) {
        entries.push({
          library: imp.module,
          module: api.module as string,
          export: api.export_name as string,
          signature: (api.signature || '') as string,
          description: (api.description || '') as string,
        });
      }
    }
  }
  db.close();

  if (entries.length === 0) { process.exit(0); }

  // Build reminder
  let reminder = `<system-reminder>\nDetected dependency usage in ${path.basename(filePath)}. Reference:\n\n`;
  for (const e of entries.slice(0, 5)) {
    reminder += `**${e.library}.${e.export}**\n`;
    if (e.signature) reminder += `\`${e.signature}\`\n`;
    reminder += `${e.description}\n\n`;
  }
  reminder += `Use \`dep_explore(library: "${thirdParty[0].module}")\` for full API reference.\n</system-reminder>`;
  process.stdout.write(reminder);
} catch {
  // Silent failure
}
process.exit(0);
```

#### Hook Registration

Add to `.claude/settings.json` hooks array (and equivalent `opencode.json`):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "command": "node dist/hooks/dep-detector.js"
      }
    ]
  }
}
```

### 9.2 New Helper: `isStdlibModule`

```typescript
// In src/shared/stdlib-modules.ts

/**
 * Returns true if a module name is a known stdlib module for the given language.
 * Used by dep-detector to exclude stdlib imports from dependency hints
 * (those are handled by api-detector).
 */
export function isStdlibModule(moduleName: string, language: string): boolean {
  // Node.js built-ins
  if (language === 'typescript' || language === 'javascript') {
    const nodeBuiltins = new Set([
      'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'stream',
      'buffer', 'events', 'util', 'child_process', 'net', 'tls', 'dns',
      'querystring', 'assert', 'zlib', 'readline', 'vm', 'worker_threads',
    ]);
    const bare = moduleName.replace(/^node:/, '');
    return nodeBuiltins.has(bare);
  }
  // Python stdlib
  if (language === 'python') {
    const pyStdlib = new Set([
      'os', 'sys', 'json', 're', 'pathlib', 'datetime', 'collections',
      'itertools', 'functools', 'typing', 'abc', 'io', 'logging', 'math',
      'random', 'string', 'hashlib', 'sqlite3', 'unittest', 'argparse',
    ]);
    return pyStdlib.has(moduleName.split('.')[0]);
  }
  return false;
}
```

---

## 10. Skills

### 10.1 `/explore-dep` Skill

**File**: `skills/explore-dep/SKILL.md`

```markdown
---
name: explore-dep
description: Interactive dependency exploration -- fetch docs, browse APIs, find patterns
triggers: ["explore dependency", "explore dep", "how to use", "dependency docs", "library docs"]
argument-hint: "<library-name> [version]"
level: 3
---

# Explore Dependency Skill

Interactive dependency exploration with auto-detection, API browsing, and pattern discovery.

## Workflow

### Step 1: Detect

Identify the target dependency from the request or project context.

1. If library name provided directly, use it.
2. If ambiguous, scan project manifests:
   - `detectProjectDependencies(project_root)` to list all deps
   - Present matching deps to user for selection

3. Call `dep_explore(library: "<name>", version: "<version>", depth: "summary")`
   - This fetches from Context7 and caches the result.

### Step 2: Browse

Present the API surface and ask what the user wants to explore further.

4. Show the summary output from `dep_explore`.
5. Ask: "Which area would you like to explore?"

### Step 3: Deep Dive

Based on user's interest, call targeted searches:

6. For specific API: `dep_search(library: "<name>", query: "<api-or-concept>")`
7. For patterns: `dep_explore(library: "<name>", depth: "full")`
8. For migration/breaking: `dep_search(library: "<name>", query: "breaking migration", category: "considerations")`

### Step 4: Contextualize

9. Cross-reference with language conventions:
   `lang_conventions(language: "<lang>")`
10. Show usage patterns that follow the project's language conventions.

## Example Usage

/explore-dep express
/explore-dep react 18
/how to use prisma
/explore dep lodash

## Output Format

## Dependency: [Name] [Version]

### Overview
[Description from Context7]

### API Surface
[Table of top-level exports]

### Key Patterns
[Top 3-5 patterns with code]

### Considerations
[Breaking changes, deprecations, security notes]
```

### 10.2 `/review-deps` Skill

**File**: `skills/review-deps/SKILL.md`

```markdown
---
name: review-deps
description: Audit project dependencies for outdated versions, missing docs, and known issues
triggers: ["review deps", "audit dependencies", "check dependencies", "dep audit"]
argument-hint: "[project-path]"
level: 3
---

# Review Dependencies Skill

Audit project dependencies for documentation coverage, version issues, and known considerations.

## Workflow

### Step 1: Scan Project

1. Call `detectProjectDependencies(project_root)` to discover all deps.
2. For each dep, check if cached:
   `dep_version_cache` lookup

### Step 2: Fetch Missing

3. For uncached deps (top 10 by importance):
   `dep_explore(library: "<name>", version: "<version>", depth: "summary")`

### Step 3: Analyze

4. For each cached dep, check considerations:
   `dep_search(library: "<name>", category: "considerations")`
5. Identify:
   - Deprecated APIs in use (cross-reference with import analysis)
   - Security warnings
   - Breaking changes affecting current version

### Step 4: Report

6. Generate audit report:

## Dependency Audit: [Project Name]

### Summary
- X total dependencies
- Y cached in code-writer
- Z with considerations

### Issues

| Library | Severity | Issue | Fix |
|---------|----------|-------|-----|
| express | warning | Middleware ordering | Use `app.use()` before routes |

### Uncached Dependencies
[List of deps not yet explored]

### Recommendations
[Suggested deps to explore or update]

## Example Usage

/review-deps
/review-deps ./my-project
/audit dependencies
```

---

## 11. File Manifest

### 11.1 New Files to Create

| File | Purpose |
|------|---------|
| `src/engine/version-detector.ts` | Parse package.json, pyproject.toml, go.mod, Cargo.toml |
| `src/engine/dep-query.ts` | Query engine for dependency data (like query.ts but for deps) |
| `src/engine/dep-indexer.ts` | Index dependency data into vector store (like indexer.ts but for deps) |
| `src/shared/stdlib-modules.ts` | Stdlib module detection for dep/stdlib disambiguation |
| `src/tools/dep-explore.ts` | MCP tool: dep_explore |
| `src/tools/dep-fetch.ts` | MCP tool: dep_fetch |
| `src/tools/dep-search.ts` | MCP tool: dep_search |
| `src/hooks/dep-detector.ts` | Hook: auto-inject dep usage hints |
| `skills/explore-dep/SKILL.md` | Skill: /explore-dep |
| `skills/review-deps/SKILL.md` | Skill: /review-deps |
| `data/_shared/dep-embedding-prompts.yaml` | Platform-specific embedding prompt templates |
| `tests/engine/version-detector.test.ts` | Tests for version detection |
| `tests/engine/dep-query.test.ts` | Tests for dep query engine |
| `tests/tools/dep-explore.test.ts` | Tests for dep_explore tool |
| `tests/tools/dep-search.test.ts` | Tests for dep_search tool |

### 11.2 Existing Files to Modify

| File | Changes |
|------|---------|
| `src/engine/database.ts` | Add 5 new tables in `initialize()`, add ~15 new CRUD methods (Section 2.2) |
| `src/engine/vector-store.ts` | Add `DEP_ORAMA_SCHEMA`, `depIndexes` map, `indexDependency()`, `depHybridSearch()`, `isDepIndexed()`, update `loadOrInitialize()` and `persist()` to handle dep indexes |
| `src/engine/types.ts` | Add all types from Section 3 (`DepRegistrySchema`, `DepApiSchema`, `DepPatternSchema`, `DepConsiderationSchema`, `DepFetchData`, `DepSearchOptions`, `DepSearchResult`, `DepDocument`, `DepIndexedDocument`, `DetectedDependency`, `ProjectDependencies`) |
| `src/engine/constants.ts` | No changes needed (APP_DIR, DATA_DIR already shared) |
| `src/mcp/server.ts` | Import and register 3 new tools (`dep_explore`, `dep_fetch`, `dep_search`). Add `detectProjectDependencies` call for auto-detection on startup. Wire tools in the `tools` array. |
| `src/index.ts` | Export new tools: `createDepExploreTool`, `createDepFetchTool`, `createDepSearchTool`. Export `detectProjectDependencies`. |
| `src/tools/vector-search.ts` | Add `DepSearchHit` type and `tryDepVectorSearch` helper (mirrors existing `tryVectorSearch`) |
| `scripts/build.mjs` | Add `src/hooks/dep-detector.ts` to the esbuild entry points for hook compilation |
| `.claude/settings.json` | Add `dep-detector` to PostToolUse hooks |
| `package.json` | Bump version to `0.2.0` |

---

## 12. Implementation Order

### Phase 1: Foundation (Database + Types)

1. Add types to `src/engine/types.ts` (Section 3)
2. Add tables and CRUD methods to `src/engine/database.ts` (Section 2)
3. Create `src/shared/stdlib-modules.ts` (Section 9.2)
4. Write tests for database methods

### Phase 2: Version Detection

5. Create `src/engine/version-detector.ts` (Section 4)
6. Write tests for version detection (package.json, pyproject.toml, go.mod, Cargo.toml)

### Phase 3: Tools

7. Create `src/tools/dep-fetch.ts` (Section 5.2) -- simplest tool, Phase 1/2 pattern
8. Create `src/engine/dep-query.ts` -- query engine wrapping DB methods
9. Create `src/tools/dep-explore.ts` (Section 5.1) -- Context7 integration
10. Create `src/tools/dep-search.ts` (Section 5.3) -- SQLite search first
11. Write tests for tools

### Phase 4: Vector Store

12. Extend `src/engine/vector-store.ts` (Section 6)
13. Create `src/engine/dep-indexer.ts`
14. Add `data/_shared/dep-embedding-prompts.yaml` (Section 8)
15. Update `src/tools/vector-search.ts` with dep helpers
16. Wire vector search into `dep_explore` and `dep_search`
17. Write tests for vector integration

### Phase 5: Hook

18. Create `src/hooks/dep-detector.ts` (Section 9)
19. Update `scripts/build.mjs` for new hook entry point
20. Update `.claude/settings.json` with hook registration
21. Test hook with stdin/stdout

### Phase 6: Skills + Server

22. Create `skills/explore-dep/SKILL.md` (Section 10.1)
23. Create `skills/review-deps/SKILL.md` (Section 10.2)
24. Wire all 3 tools into `src/mcp/server.ts`
25. Update `src/index.ts` exports
26. Update `package.json` version

### Phase 7: Integration Testing

27. End-to-end test: dep_explore -> dep_search -> dep-detector hook
28. Test with real Context7 API calls (mocked in CI)
29. Performance test: verify 100+ dep indexing doesn't block MCP startup

---

## Appendix A: Context7 API Integration

The `dep_explore` tool communicates with Context7 via HTTP (not via the MCP server, to avoid circular dependency). The Context7 API endpoints used:

### Resolve Library ID

```
POST https://context7.com/api/v1/resolve
Content-Type: application/json

{
  "query": "express web framework",
  "libraryName": "express"
}

Response:
{
  "libraryId": "/expressjs/express",
  "name": "Express",
  "description": "Fast, unopinionated web framework for Node.js",
  "versions": [
    { "version": "4.18.2", "libraryId": "/expressjs/express/v4.18.2" }
  ]
}
```

### Query Documentation

```
POST https://context7.com/api/v1/query
Content-Type: application/json

{
  "libraryId": "/expressjs/express",
  "query": "express API reference methods functions routing middleware",
  "tokens": 8000
}

Response:
{
  "content": "...structured documentation text with code blocks...",
  "meta": { "tokens_used": 6234 }
}
```

### Parsing Strategy

The Context7 response is markdown text. Parsing into structured types:

1. **APIs**: Look for heading patterns (`## functionName` or `### Class.method`), code blocks with signatures, and description text
2. **Patterns**: Look for sections titled "Usage", "Example", "Pattern", or "How to"
3. **Considerations**: Look for sections titled "Breaking", "Migration", "Deprecated", "Security", "Warning"

A lightweight markdown parser extracts these sections. If parsing fails, the raw text is stored as a single "overview" pattern entry.

---

## Appendix B: Dependency Alias Map

Similar to `MODULE_ALIASES` for stdlib, a dependency alias map resolves common package name variants:

```typescript
// src/shared/dep-aliases.ts

export const DEP_ALIASES: Record<string, Record<string, string>> = {
  typescript: {
    // Package name -> canonical name for lookup
    '@expressjs/express': 'express',
    '@react/react': 'react',
    'react-dom': 'react',
    '@vue/vue': 'vue',
    '@babel/core': 'babel',
    '@typescript-eslint/parser': 'typescript-eslint',
  },
  python: {
    'python-dateutil': 'dateutil',
    'Pillow': 'pillow',
    'pyyaml': 'yaml',
    'sklearn': 'scikit-learn',
  },
  go: {},
  rust: {},
};
```

This file is optional and can be expanded over time. It is used by `dep-detector` and `dep_explore` to normalize library names before lookup.

---

## Appendix C: Performance Considerations

### Indexing Budget

| Operation | Expected Time | Notes |
|-----------|--------------|-------|
| Context7 fetch (3 parallel) | 2-5s | Network-bound |
| SQLite insert (200 APIs) | <100ms | Batch insert in transaction |
| Vector embed (200 docs) | 1-3s | Local ONNX, batched 8 at a time |
| Orama insert (200 docs) | <200ms | Batched 1000 at a time |

### Auto-Indexing Strategy

On MCP server startup, auto-index dependency data only for:
1. Dependencies that are not yet vector-indexed (`is_indexed = 0`)
2. Limit to 3 concurrent indexing operations
3. Fire-and-forget (tools fall back to SQLite when vector is not ready)

### Cache Invalidation

- `dep_version_cache` is keyed by `(library_name, language, version_range)`
- If the resolved version changes (user upgrades), the old cache entry is preserved but new fetch is triggered
- `force: true` on `dep_explore` or `dep_fetch` clears and re-fetches

### Storage Estimate

| Per dependency | Size |
|--------------|------|
| SQLite rows (200 APIs + 20 patterns + 5 considerations) | ~200 KB |
| Orama index file | ~500 KB |
| Total per dep | ~700 KB |
| 100 dependencies | ~70 MB |

---

## Appendix D: Error Handling

All tools follow the existing error pattern:

```typescript
try {
  return await tool.handler(request.params.arguments);
} catch (error) {
  return {
    content: [{
      type: 'text' as const,
      text: `Error: ${error instanceof Error ? error.message : String(error)}`
    }],
    isError: true,
  };
}
```

Specific error cases:

| Tool | Error | Behavior |
|------|-------|----------|
| `dep_explore` | Context7 unreachable | Return error suggesting `dep_fetch` with manual data |
| `dep_explore` | Library not found in Context7 | Return error with suggestion to check spelling |
| `dep_explore` | Version not found | Return error listing available versions from Context7 |
| `dep_search` | No cached deps | Return "No dependencies cached. Use dep_explore first." |
| `dep_fetch` | Invalid data format | Return validation error with expected schema |
| `dep-detector` | Any error | Silent exit (process.exit(0)), no output |
