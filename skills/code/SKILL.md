---
name: code
description: Full code writing pipeline with stdlib lookup, LSP validation, and iterative review
triggers: ["write code", "implement", "create", "build", "code for"]
argument-hint: "<description-of-what-to-build>"
level: 3
---

# Code Workflow Skill

End-to-end code writing with language-aware stdlib lookup, LSP validation, and iterative quality improvement.

## Workflow

### Phase 1: Acquire Context

1. **Detect Language**: Identify the target language from the request or project context.
   - Check project memory: `lang_ref(language: "<lang>")`
   - If language data is missing, use `lang_fetch(language: "<lang>")` to populate it from Context7/web.

2. **Search APIs**: Find relevant stdlib APIs for the task.
   ```
   lang_search(query: "<task-description>", language: "<lang>")
   ```

3. **Get Conventions**: Load coding conventions.
   ```
   lang_conventions(language: "<lang>")
   ```

### Phase 2: Write Code

4. **Implement**: Write the code following gathered context.
   - Use stdlib APIs from Phase 1 (do not reinvent)
   - Follow naming conventions and style rules
   - Keep code concise — prefer built-in methods over manual implementations

### Phase 3: LSP Validate

5. **Check Diagnostics**: Run LSP validation on the written file.
   ```
   lsp_diagnostics(file: "<path>")
   ```

6. **Auto-fix**: If errors found, apply available code actions.
   ```
   lsp_code_actions(file: "<path>", startLine: <n>, startCharacter: <n>, endLine: <n>, endCharacter: <n>)
   ```

7. **Re-validate**: Repeat steps 5-6 until no errors remain.

### Phase 4: Review & Simplify (up to 3 iterations)

8. **Simplify**: Check for code simplification opportunities.
   - Remove redundant code
   - Use stdlib methods over manual implementations
   - Reduce nesting and complexity

9. **Convention Check**: Run `lang_conventions(language: "<lang>")` against final code.
   - Fix any violations found

10. **Iterate**: If issues found in steps 8-9, fix and repeat (max 3 iterations).
    - Stop early if no issues found in a review pass

### Phase 5: Final Output

11. **Present**: Show the final code with:
    - Summary of what was built
    - Conventions followed
    - LSP validation status
    - Any remaining warnings or notes

## Iteration Control

- Max 3 review iterations to prevent infinite loops
- Stop early if no issues found in a review pass
- Track what changed each iteration for transparency

## Example Usage

```
/code implement a file watcher in typescript
/code create a REST API handler in python
/code build a binary search tree in rust
/code write a CLI argument parser in go
```
