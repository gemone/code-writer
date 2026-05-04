# @gemone/code-standards

Coding standard library and syntax reference plugin for **Claude Code** and **OpenCode** via MCP.

Provides structured, queryable access to programming language standard libraries, syntax references, coding conventions, and best practices. Ships with minimal seed data — comprehensive stdlib/syntax data is auto-fetched on demand via `lang_fetch`.

## Language Data Workflow

The repo ships with **minimal seed data** (conventions + registry). To get comprehensive data:

1. `lang_fetch(language: "<name>", version: "<version>")` scaffolds from `data/_template/`
2. Populate the data using Context7 or web search (the tool returns instructions)
3. Call `lang_fetch` again with the `data` parameter to sync to the database

Or use `/new-lang <language>` which runs this workflow automatically.

## Supported Languages

| Language | Version | Status |
|----------|---------|--------|
| TypeScript | 5.7 | seeded + fetched |
| Python | 3.13 | seeded + fetched |
| Zig | 0.16 | seed only |

## Features

- **`lang_ref`** — Look up stdlib API reference (signatures, examples, tags)
- **`lang_search`** — Full-text search across stdlib, syntax, conventions, patterns
- **`lang_conventions`** — Coding conventions with severity levels and good/bad examples
- **`lang_compare`** — Compare concepts across multiple languages side-by-side
- **`lang_fetch`** — Scaffold and populate new language definitions from Context7/web
- **`lang_ast`** — AST-based code query, replace, lint, and extract (via tree-sitter)

### Claude Code Hooks

- **Language detection** — Injects quick-reference when a language is mentioned in your prompt
- **Convention lint** — Checks written code against conventions (e.g., `var` usage, bare `except:`)
- **API detection** — Shows relevant stdlib docs when you import modules
- **Project memory** — Tracks project languages and updates `CLAUDE.md`

## Setup

### Claude Code

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "code-standards": {
      "command": "node",
      "args": ["dist/mcp/server.cjs"]
    }
  }
}
```

Hooks are configured in `.claude/settings.json` (included in the repo).

### OpenCode

Add to `opencode.json`:

```json
{
  "mcp": {
    "code-standards": {
      "type": "local",
      "command": ["node", "dist/mcp/server.cjs"],
      "enabled": true
    }
  },
  "plugin": ["./.opencode/plugins/code-standards-hooks.ts"]
}
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build (tsc + esbuild)
npm run dev          # TypeScript watch mode
npm test             # Run test suite
npm run validate     # Validate YAML data files
```

## Adding a New Language

The recommended approach uses `lang_fetch` — no manual YAML authoring needed:

1. Call `lang_fetch(language: "<name>", version: "<version>")` or use `/new-lang <name>`
2. The tool scaffolds the directory and provides instructions for auto-populating from Context7
3. After population, call `lang_fetch` again with the populated `data` to sync

For manual setup: `npm run add-lang -- <name>` scaffolds from `data/_template/`, then edit YAML files and update `data/index.yaml`.

## License

MIT
