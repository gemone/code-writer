import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const dataDir = path.resolve(import.meta.dirname, '../data');

const requiredLanguageFiles = ['language.yaml', 'stdlib.yaml', 'syntax.yaml', 'conventions.yaml', 'patterns.yaml'];

let errors = 0;

function error(file, msg) {
  console.error(`ERROR: ${file}: ${msg}`);
  errors++;
}

// Validate index.yaml
const indexPath = path.join(dataDir, 'index.yaml');
if (!fs.existsSync(indexPath)) {
  error('index.yaml', 'Missing language registry');
  process.exit(1);
}

const registry = yaml.load(fs.readFileSync(indexPath, 'utf-8'));
if (!registry?.languages) {
  error('index.yaml', 'Missing "languages" key');
}

// Validate each language
for (const [langId, entry] of Object.entries(registry?.languages || {})) {
  const langDir = path.join(dataDir, entry.dataDir);
  if (!fs.existsSync(langDir)) {
    error(`${entry.dataDir}/`, 'Language directory missing');
    continue;
  }

  for (const file of requiredLanguageFiles) {
    const filePath = path.join(langDir, file);
    if (!fs.existsSync(filePath)) {
      error(`${entry.dataDir}/${file}`, 'Required file missing');
      continue;
    }

    try {
      const data = yaml.load(fs.readFileSync(filePath, 'utf-8'));
      if (!data || typeof data !== 'object') {
        error(`${entry.dataDir}/${file}`, 'Invalid YAML (not an object)');
      }
    } catch (e) {
      error(`${entry.dataDir}/${file}`, `YAML parse error: ${e.message}`);
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} error(s) found.`);
  process.exit(1);
} else {
  console.log('All data files valid.');
}
