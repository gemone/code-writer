Full code writing pipeline with stdlib lookup, LSP validation, and iterative review.

## Workflow

### Phase 1: Acquire Context
1. Detect language from request or project context
2. Use `lang_ref(language: "<lang>")` for stdlib APIs
3. Use `lang_search(query: "<task>", language: "<lang>")` for relevant patterns
4. Use `lang_conventions(language: "<lang>")` for coding conventions

### Phase 2: Write Code
- Use stdlib APIs from Phase 1 (do not reinvent)
- Follow naming conventions and style rules
- Keep code concise — prefer built-in methods

### Phase 3: LSP Validate
- Run diagnostics on the written file
- Auto-fix available code actions
- Re-validate until no errors remain

### Phase 4: Review & Simplify (up to 3 iterations)
- Remove redundant code
- Use stdlib methods over manual implementations
- Reduce nesting and complexity
- Check conventions compliance

### Phase 5: Final Output
- Summary of what was built
- Conventions followed
- LSP validation status

Arguments: `<description-of-what-to-build>`
