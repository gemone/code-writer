Review code against language coding conventions.

## Steps
1. Detect language from the file extension
2. Load conventions using `lang_conventions(language: "<lang>")`
3. Check code against each convention rule
4. Report violations with severity (error/warn/info)
5. Suggest fixes with good/bad examples from conventions
6. Run LSP diagnostics for additional validation

## Usage
- Review a specific file: `/review-style path/to/file.ts`
- Review current changes: `/review-style`

Arguments: `[file-path]`
