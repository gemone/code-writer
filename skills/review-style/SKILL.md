---
name: review-style
description: Review code against language-specific coding standards and conventions
triggers: ["review style", "check conventions", "style check", "lint style", "code review"]
argument-hint: "[file-path-or-language]"
level: 2
---

# Review Style Skill

Review code against language-specific coding standards and conventions.

## Workflow

1. **Detect Language**: Identify the programming language from the file extension or explicit argument.
   - `.ts`, `.tsx` -> TypeScript
   - `.py` -> Python
   - If no file specified, ask the user to provide code or a file path

2. **Load Conventions**: Use the `lang_conventions` MCP tool to fetch language-specific rules.
   ```
   lang_conventions(language="<language>")
   ```

3. **Analyze Code**: Review the code against all loaded conventions.
   - Check naming conventions (camelCase, snake_case, etc.)
   - Verify error handling patterns
   - Assess code organization and structure
   - Identify potential code smells

4. **LSP Validation**: Run `lsp_diagnostics` on the target file to catch compiler/type errors that conventions alone cannot detect.
   - If diagnostics found, use `lsp_code_actions` for available auto-fixes.
   - Report LSP findings alongside convention findings.

5. **Present Findings**: Report issues organized by severity.
   - **Error**: Must fix (e.g., missing error handling)
   - **Warning**: Should fix (e.g., non-descriptive variable names)
   - **Info**: Consider fixing (e.g., could use immutable approach)

## Example Usage

```
/review-style src/utils.ts
/review-style
/review-style python
```

## Output Format

```
## Style Review: [filename]

### Errors (Must Fix)
- Line 15: Missing error handling for async operation
- Line 42: Using `any` type instead of proper type annotation

### Warnings (Should Fix)
- Line 8: Variable name `x` is not descriptive
- Line 23: Function exceeds 30 lines, consider splitting

### Info (Consider)
- Line 5: Consider using `const` instead of `let`
- Line 31: Could use optional chaining `?.`

### Summary
- Total issues: 6
- Errors: 2 | Warnings: 2 | Info: 2
```
