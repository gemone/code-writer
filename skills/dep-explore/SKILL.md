---
name: dep-explore
description: Explore a dependency library: APIs, usage patterns, and considerations
triggers: ["dep explore", "dependency explore", "library explore", "explore dep", "explore library"]
argument-hint: "<library-name> [version]"
level: 2
---

# Dependency Explore Skill

Explore a dependency library's cached data: API surface, usage patterns, and considerations.

## Workflow

1. **Parse Query**: Extract the library name and optional version.
   - Example: "express" -> libraryName: `express`
   - Example: "react 18" -> libraryName: `react`, version: `^18.0.0`

2. **Check Cache**: Use `dep_explore` to see if the library is already cached.
   ```
   dep_explore(libraryName="<name>", language="<language>", version="<version>")
   ```

3. **If Not Cached**: Use `dep_fetch` Phase 1 to get instructions for gathering data.
   ```
   dep_fetch(libraryName="<name>", language="<language>", version="<version>")
   ```
   Follow the Context7 instructions returned, then call `dep_fetch` Phase 2 with populated data.

4. **Present Results**: Display the cached information clearly.
   - API Surface: Key exports with signatures
   - Patterns: Recommended usage patterns with code examples
   - Considerations: Security, performance, and migration warnings

5. **Offer Deep Dive**: Suggest searching for specific topics.
   - "Use `dep_search(query: "routing patterns", libraryName: "express")` for specific API lookups"

## Example Usage

```
/dep-explore express
/dep-explore react ^18.0.0
/dep-explore next.js ^14.0.0
```

## Output Format

```
## [Library] ([Version]) - [Language]

### API Surface
| Module | Export | Description |
|--------|--------|-------------|
| Router | get | Handle GET requests |

### Key Patterns
- [Pattern name]: [Description]

### Considerations
- [WARNING]: [Title] - [Fix suggestion]
```
