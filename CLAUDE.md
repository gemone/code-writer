# Code Standards Plugin

Works with both **Claude Code** and **OpenCode** via standard MCP protocol.

## Platform Setup

| Platform | Config | Commands |
|----------|--------|----------|
| Claude Code | `.mcp.json` + `.claude/settings.json` | `/lookup`, `/code`, `/review-style`, `/explain-pattern`, `/new-lang` |
| OpenCode | `opencode.json` + `.opencode/` | `/lookup`, `/code`, `/review-style`, `/explain-pattern`, `/new-lang` |

## Available Tools

| Tool | Description |
|------|-------------|
| `lang_ref` | Look up language syntax and stdlib APIs |
| `lang_search` | Search for patterns, idioms, and examples |
| `lang_conventions` | Get coding conventions for a language |
| `lang_compare` | Compare approaches across languages |
| `lang_fetch` | Fetch and register stdlib data for a new language |
| `lang_ast` | AST-based code query, replace, lint, and extract |

## Language Data Workflow

The repo ships with **minimal seed data** (conventions + registry). Comprehensive stdlib/syntax data is **auto-fetched** on demand:

1. `lang_fetch(language: "<name>", version: "<version>")` scaffolds from `data/_template/`
2. The tool returns instructions for populating data via Context7 or web search
3. Call `lang_fetch` again with the `data` parameter to sync to the database

No manual YAML authoring required. Use `/new-lang <language>` or call `lang_fetch` directly.

## Supported Languages

| Language | Version | Status |
|----------|---------|--------|
| TypeScript | 5.7 | seeded + fetched |
| Python | 3.13 | seeded + fetched |
| Zig | 0.16 | seed only |

## Slash Commands

- `/lookup <language> <query>` - Look up syntax, APIs, or patterns
- `/review-style [file]` - Review code against conventions
- `/explain-pattern <pattern> [language]` - Explain design patterns
- `/new-lang <language>` - Add a new language via `lang_fetch`
- `/code <description>` - Full code pipeline with stdlib lookup, LSP validation, and review

## Project Structure

```
src/
├── engine/           # Core: DB, loader, query, AST, types, project-memory
├── tools/            # MCP tool handlers (lang_ref, lang_search, lang_fetch, etc.)
├── hooks/            # Claude Code hooks (language-detector, api-detector, conventions-lint, project-memory)
├── shared/           # Shared constants (EXT_TO_LANG mapping)
└── mcp/              # MCP server entry point
data/
├── _shared/          # Cross-language conventions and patterns
├── _template/        # Templates for new language scaffolding
├── index.yaml        # Language registry
├── typescript/       # TypeScript seed data
├── python/           # Python seed data
└── zig/              # Zig seed data
skills/               # Claude Code skill definitions
.opencode/            # OpenCode plugin + commands
scripts/              # Build, validation, scaffolding scripts
tests/                # Vitest test suite
```

<!-- code-writer: project-languages -->
## Project Languages
typescript, python
<!-- /code-writer: project-languages -->
