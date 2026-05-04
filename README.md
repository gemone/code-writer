# @gemone/code-writer

Language-aware coding assistant plugin for **Claude Code** and **OpenCode** via MCP.

Provides structured, queryable access to programming language stdlib APIs, syntax references, coding conventions, and design patterns. Ships with minimal seed data — comprehensive language documentation is auto-fetched on demand via `lang_fetch`. Local stdlib files are auto-indexed on first use with semantic (vector) search powered by Orama.

## Features

### MCP Tools

| Tool | Description |
|------|-------------|
| `lang_ref` | Look up stdlib API reference (signatures, examples) |
| `lang_search` | Semantic search across stdlib, syntax, conventions, patterns |
| `lang_conventions` | Coding conventions with severity levels and good/bad examples |
| `lang_compare` | Compare concepts across multiple languages side-by-side |
| `lang_fetch` | Scaffold and populate new language definitions from Context7/web |
| `lang_ast` | AST-based code query, replace, lint, and extract (via tree-sitter) |
| `lang_index` | Manually trigger stdlib re-indexing for a language |

### Claude Code Hooks

- **Language detection** — Injects quick-reference when a language is mentioned in your prompt
- **Convention lint** — Checks written code against conventions (e.g., `var` usage, bare `except:`)
- **API detection** — Shows relevant stdlib docs when you import modules
- **Project memory** — Tracks project languages and updates `CLAUDE.md`

## Installation

### Prerequisites

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [OpenCode](https://opencode.ai)

### Claude Code

```bash
# 1. Clone and build
git clone https://github.com/gemone/code-writer.git
cd code-writer
npm install && npm run build

# 2. Add MCP server to your project's .mcp.json (or global ~/.claude/.mcp.json)
# .mcp.json
{
  "mcpServers": {
    "code-writer": {
      "command": "node",
      "args": ["/absolute/path/to/code-writer/dist/mcp/server.cjs"]
    }
  }
}

# 3. Add hooks to .claude/settings.json (project or global)
# .claude/settings.json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "node /absolute/path/to/code-writer/dist/hooks/language-detector.cjs", "timeout": 3000 }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "node /absolute/path/to/code-writer/dist/hooks/api-detector.cjs", "timeout": 5000 }]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "node /absolute/path/to/code-writer/dist/hooks/conventions-lint.cjs", "timeout": 5000 }]
      },
      {
        "matcher": "Write",
        "hooks": [{ "type": "command", "command": "node /absolute/path/to/code-writer/dist/hooks/project-memory.cjs", "timeout": 2000 }]
      }
    ]
  }
}

# 4. Restart Claude Code, then verify
# > lang_search("map")
# > lang_conventions(language: "typescript")
```

### OpenCode

```bash
# 1. Clone and build
git clone https://github.com/gemone/code-writer.git
cd code-writer
npm install && npm run build

# 2. Add to opencode.json in your project root
# opencode.json
{
  "mcp": {
    "code-writer": {
      "type": "local",
      "command": ["node", "/absolute/path/to/code-writer/dist/mcp/server.cjs"],
      "enabled": true
    }
  },
  "plugin": ["/absolute/path/to/code-writer/.opencode/plugins/code-writer-hooks.ts"]
}

# 3. Restart OpenCode, then verify
# > lang_search("map")
# > lang_conventions(language: "typescript")
```

## Supported Languages

| Language | Version | Status |
|----------|---------|--------|
| TypeScript | 5.7 | seeded + fetched |
| Python | 3.13 | seeded + fetched |
| Zig | 0.16 | seed only |

Add more languages with `lang_fetch(language: "<name>", version: "<version>")` or `/new-lang <name>`.

## Configuration

Global config file: `~/.code-writer/config.yaml`

```yaml
embedding:
  provider: "local"                    # "local" (transformers.js WASM) | "openai://model" | "http://..."
  model: "all-MiniLM-L6-v2"           # local model name
  hfEndpoint: "https://hf-mirror.com" # HuggingFace mirror (optional, also reads HF_ENDPOINT env var)
  # apiKey: "sk-..."                   # for OpenAI/external APIs
  # baseUrl: "https://..."             # API base URL override
```

### Embedding Providers

| Provider | Config | Notes |
|----------|--------|-------|
| Local (WASM) | `provider: "local"` | Default. Uses `onnxruntime-web`, no native binaries needed. First run downloads model (~30MB). |
| OpenAI | `provider: "openai://text-embedding-3-small"` | Requires `apiKey`. |
| HTTP API | `provider: "http://localhost:11434/api/embed"` | Generic endpoint (Ollama, etc.). Set `dimension` if not 384. |

### Auto-Indexing

On first startup, the plugin discovers and indexes local stdlib files defined in each language's `sources` config:

- **TypeScript**: `node_modules/typescript/lib/lib.*.d.ts`
- **Python**: `/usr/lib/python3.*/**/*.py`
- **Zig**: `/usr/lib/zig/std/**/*.zig` (requires local Zig install)

Index is persisted per-language to `~/.code-writer/orama-<lang>.msp`. Re-index with `lang_index(language: "typescript", force: true)`.

## Language Data Workflow

The repo ships with **minimal seed data** (conventions + registry). Full stdlib/syntax data is auto-fetched on demand:

1. `lang_fetch(language: "<name>", version: "<version>")` scaffolds from `data/_template/`
2. Populate using Context7 or web search (the tool returns instructions)
3. Call `lang_fetch` again with the `data` parameter to sync to the database

## Slash Commands (Claude Code)

| Command | Description |
|---------|-------------|
| `/lookup <language> <query>` | Look up syntax, APIs, or patterns |
| `/review-style [file]` | Review code against conventions |
| `/explain-pattern <pattern> [language]` | Explain design patterns |
| `/new-lang <language>` | Add a new language via `lang_fetch` |
| `/code <description>` | Full code pipeline with stdlib lookup and review |

## Development

```bash
npm install          # Install dependencies
npm run build        # Build (tsc + esbuild)
npm run dev          # TypeScript watch mode
npm test             # Run test suite (50 tests)
npm run validate     # Validate YAML data files
```

## Project Structure

```
src/
├── engine/           # Core: DB, loader, query, AST, types, embedding, vector-store, indexer
├── tools/            # MCP tool handlers (lang_ref, lang_search, lang_index, etc.)
├── hooks/            # Claude Code hooks
├── shared/           # Shared constants (EXT_TO_LANG, MODULE_ALIASES)
└── mcp/              # MCP server entry point
data/
├── _shared/          # Cross-language conventions and patterns
├── _template/        # Templates for new language scaffolding
├── index.yaml        # Language registry
├── typescript/       # TypeScript seed data
├── python/           # Python seed data
└── zig/              # Zig seed data
~/.code-writer/
├── config.yaml            # Global config (embedding provider, HF mirror)
├── data.db                # SQLite (conventions, patterns)
└── orama-<lang>.msp       # Per-language Orama vector index (e.g. orama-typescript.msp)
```

## License

MIT
