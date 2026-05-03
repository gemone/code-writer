import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(import.meta.dirname, '../data');
const templateDir = path.join(dataDir, '_template');

const langName = process.argv[2];
if (!langName) {
  console.error('Usage: pnpm run add-lang -- <language-name>');
  process.exit(1);
}

const langDir = path.join(dataDir, langName);
if (fs.existsSync(langDir)) {
  console.error(`Language directory already exists: ${langDir}`);
  process.exit(1);
}

fs.mkdirSync(langDir, { recursive: true });

const files = fs.readdirSync(templateDir);
for (const file of files) {
  const src = path.join(templateDir, file);
  const dest = path.join(langDir, file);
  let content = fs.readFileSync(src, 'utf-8');
  content = content.replace(/\{\{LANGUAGE\}\}/g, langName);
  fs.writeFileSync(dest, content);
}

console.log(`Created language scaffold at ${langDir}`);
console.log(`\nNext steps:`);
console.log(`1. Edit the YAML files in data/${langName}/`);
console.log(`2. Add entry to data/index.yaml`);
console.log(`3. Run: pnpm run validate`);
