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

## Supported Languages

| Language | Version | Key Conventions |
|----------|---------|-----------------|
| TypeScript | 5.7 | camelCase vars/fns, PascalCase types, UPPER_SNAKE constants |
| Python | 3.13 | snake_case vars/fns, PascalCase classes, UPPER_SNAKE constants |

## Quick Conventions

### TypeScript
- Use `const` over `let`, never `var`
- Prefer `interface` over `type` for object shapes
- Always specify return types for public functions
- Use optional chaining `?.` and nullish coalescing `??`
- Handle errors with typed catch blocks

### Python
- Use snake_case for variables and functions
- Use PascalCase for classes
- Always include type hints for function signatures
- Use f-strings over `.format()` or `%`
- Handle exceptions with specific exception types

## Slash Commands

- `/lookup <language> <query>` - Look up syntax, APIs, or patterns
- `/review-style [file]` - Review code against conventions
- `/explain-pattern <pattern> [language]` - Explain design patterns
- `/new-lang <language>` - Add a new language definition
- `/code <description>` - Full code pipeline with stdlib lookup, LSP validation, and review

## Project Structure

```
data/
├── _shared/          # Cross-language conventions and patterns
│   ├── conventions.yaml
│   └── patterns.yaml
├── _template/        # Templates for new languages
├── index.yaml        # Language registry
├── typescript/       # TypeScript-specific data
└── python/           # Python-specific data
skills/               # Claude Code skill definitions
├── code/
├── lookup/
├── review-style/
├── explain-pattern/
└── new-lang/
.opencode/            # OpenCode plugin + commands
├── plugins/
└── commands/
```

<!-- code-standards: project-languages -->
## Project Languages
typescript
<!-- /code-standards: project-languages -->
