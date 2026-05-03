---
name: explain-pattern
description: Explain a design pattern or programming idiom with language-specific examples
triggers: ["explain pattern", "show me the pattern", "what is the pattern for", "how to implement"]
argument-hint: "<pattern-name> [language]"
level: 2
---

# Explain Pattern Skill

Explain a design pattern or programming idiom with language-specific examples.

## Workflow

1. **Identify Pattern**: Parse the pattern name and optional language from the input.
   - Example: "observer pattern typescript" -> pattern: `observer`, language: `typescript`
   - Example: "show me the strategy pattern" -> pattern: `strategy`, language: (use default or ask)

2. **Load Pattern Data**: Retrieve pattern information from shared patterns or language-specific patterns.
   - Check `data/_shared/patterns.yaml` for cross-language patterns
   - Check `data/<language>/patterns.yaml` for language-specific implementations

3. **Explain the Pattern**: Provide a comprehensive explanation.
   - **Intent**: What problem does this pattern solve?
   - **Structure**: Key components and their relationships
   - **When to Use**: Applicable scenarios
   - **When to Avoid**: Anti-patterns or misuse

4. **Provide Implementation**: Show language-specific code examples.
   - Include all necessary interfaces/classes
   - Demonstrate typical usage
   - Highlight language-specific idioms

## Example Usage

```
/explain-pattern observer typescript
/explain-pattern strategy pattern python
/show me the pattern for dependency injection
```

## Output Format

```
## [Pattern Name] Pattern

### Intent
[What problem this pattern solves]

### Structure
- **Component 1**: [Description]
- **Component 2**: [Description]
- **Component 3**: [Description]

### When to Use
- [Scenario 1]
- [Scenario 2]

### When to Avoid
- [Anti-pattern 1]
- [Anti-pattern 2]

### [Language] Implementation

```[language]
// Complete implementation example
```

### Usage Example

```[language]
// How to use the pattern
```

### Validation

After showing the implementation, validate it:
- Use `lsp_diagnostics` to check for type errors
- Use `lsp_code_actions` to suggest improvements

### Related Patterns
- [Related pattern 1]
- [Related pattern 2]
```
