Scaffold and populate a new language definition.

## Steps
1. Use `lang_fetch(language: "<name>", version: "<version>")` to scaffold the directory
2. Follow the returned instructions to populate YAML files:
   - `stdlib.yaml` — standard library APIs
   - `syntax.yaml` — language syntax guide
   - `conventions.yaml` — coding conventions
   - `patterns.yaml` — common patterns
3. Call `lang_fetch` again with the `data` parameter to sync to database

## Usage
`/new-lang rust`
`/new-lang go`

Arguments: `<language-name>`
