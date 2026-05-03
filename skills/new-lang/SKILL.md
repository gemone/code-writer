---
name: new-lang
description: Scaffold and populate a new language definition for the standards library
triggers: ["add language", "new language", "support for"]
argument-hint: "<language-name>"
level: 3
---

# New Language Skill

Scaffold and populate a new language definition for the standards library.

## Workflow

## Recommended Approach

Use the `lang_fetch` MCP tool to scaffold and populate language data automatically:
```
lang_fetch(language: "<name>", version: "<version>")
```
This scaffolds the directory and returns instructions for fetching documentation via Context7 or web search. After populating the data, call `lang_fetch` again with the `data` parameter to sync to the database.

## Manual Workflow

1. **Validate Language Name**: Ensure the language name is valid and not already registered.
   - Check `data/index.yaml` for existing languages
   - Normalize the name (lowercase, no spaces)

2. **Create Directory Structure**: Generate the language data directory.
   ```
   data/<language>/
   ├── language.yaml      # Language metadata
   ├── stdlib.yaml        # Standard library reference
   ├── syntax.yaml        # Syntax reference
   ├── conventions.yaml   # Coding conventions
   └── patterns.yaml      # Language-specific patterns
   ```

3. **Populate Files**: Use templates from `data/_template/` to initialize each file.
   - Copy and customize each template
   - Set appropriate TODO markers for user to fill in

4. **Update Registry**: Add the new language to `data/index.yaml`.
   ```yaml
   <language>:
     name: <Language Name>
     version: "<version>"
     extensions: ["<ext1>", "<ext2>"]
     aliases: ["<alias1>"]
     dataDir: "<language>"
     tags: ["<tag1>", "<tag2>"]
   ```

5. **Provide Guidance**: Show the user what needs to be filled in.
   - List all TODO items
   - Suggest starting points for each file
   - Offer to help populate specific sections

## Example Usage

```
/new-lang rust
/add language go
/support for swift
```

## Output Format

```
## New Language: [Language Name]

### Created Files
- `data/<language>/language.yaml` - Language metadata
- `data/<language>/stdlib.yaml` - Standard library reference
- `data/<language>/syntax.yaml` - Syntax reference
- `data/<language>/conventions.yaml` - Coding conventions
- `data/<language>/patterns.yaml` - Language-specific patterns

### Registry Updated
Added `[language]` to `data/index.yaml`

### Next Steps
1. Fill in language metadata in `language.yaml`
2. Add common stdlib functions to `stdlib.yaml`
3. Document syntax rules in `syntax.yaml`
4. Define coding conventions in `conventions.yaml`
5. Add language-specific patterns to `patterns.yaml`

### TODO Summary
- `language.yaml`: 3 TODOs
- `stdlib.yaml`: 5 TODOs
- `syntax.yaml`: 4 TODOs
- `conventions.yaml`: 6 TODOs
- `patterns.yaml`: 4 TODOs
```
