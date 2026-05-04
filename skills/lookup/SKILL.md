---
name: lookup
description: Look up language syntax, stdlib APIs, patterns, and conventions
triggers: ["lookup", "how do I", "what's the syntax for", "std lib", "stdlib", "api reference"]
argument-hint: "<language> <query>"
level: 2
---

# Lookup Skill

Look up language syntax, standard library APIs, patterns, and conventions.

## Workflow

1. **Parse Query**: Extract the target language and topic from the user's input.
   - Example: "typescript array map" -> language: `typescript`, topic: `array map`
   - Example: "how do I read a file in python" -> language: `python`, topic: `read file`

2. **Search for Information**: Use the `lang_search` MCP tool to find relevant syntax, APIs, or patterns.
   ```
   lang_search(language="<language>", query="<topic>")
   ```
   If no results found, the language data may not be fetched yet. Suggest using `lang_fetch(language: "<language>")` to populate it.

3. **Present Results**: Display findings with clear code examples.
   - Include the syntax or API signature
   - Provide a minimal working example
   - Note any common pitfalls or gotchas

4. **Offer Related Patterns**: Suggest related patterns or alternative approaches.
   - "You might also be interested in: [related pattern]"
   - Link to relevant conventions if applicable

## Example Usage

```
/lookup typescript array destructuring
/lookup python list comprehension
/lookup how do I handle errors in go
```

## Output Format

```
## [Language] - [Topic]

### Syntax
```[language]
// code example
```

### Example
```[language]
// working example
```

### Related
- [Related pattern 1]
- [Related pattern 2]

## LSP Enhanced Lookup

For deeper type information, use the oh-my-claudecode LSP tools:
- `lsp_hover` for type info at a specific position
- `lsp_goto_definition` to find where a symbol is defined
- `lsp_find_references` to see all usages
```
