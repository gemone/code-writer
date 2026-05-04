---
name: new-lang
description: Scaffold and populate a new language definition via lang_fetch (auto-populate from Context7/web)
triggers: ["add language", "new language", "support for"]
argument-hint: "<language-name>"
level: 3
---

# New Language Skill

Add a new language definition using the `lang_fetch` auto-populate workflow.

## Workflow

### Step 1: Scaffold

Use `lang_fetch` to create the directory structure from `data/_template/`:
```
lang_fetch(language: "<name>", version: "<version>")
```
This creates `data/<language>/` with minimal seed files and returns instructions for auto-populating from Context7 or web search.

### Step 2: Populate

Follow the returned instructions to fetch comprehensive data:
- The tool provides Context7/web search queries for stdlib, syntax, conventions, and patterns
- Call `lang_fetch` again with the `data` parameter to sync populated data to the database:
  ```
  lang_fetch(language: "<name>", data: { <populated YAML data> })
  ```

### Step 3: Verify

- Call `lang_search(language: "<name>", query: "<test-query>")` to confirm data is queryable
- Run `lang_conventions(language: "<name>")` to verify conventions loaded

## Fallback: Manual Setup

If auto-fetch is unavailable, scaffold manually with `npm run add-lang -- <name>` and edit the YAML files in `data/<language>/`.

## Example Usage

```
/new-lang rust
/add language go
/support for swift
```

## Output Format

```
## New Language: [Language Name]

### Scaffolded
- `data/<language>/` created from template
- Entry added to `data/index.yaml`

### Data Population
Use `lang_fetch` with the returned instructions to auto-populate from Context7/web.

### Verify
lang_search(language="<name>", query="<test>")
```
