import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { LanguageLoader } from './loader.js';
import { EmbeddingProvider } from './embedding.js';
import { VectorStore } from './vector-store.js';
import { CodeDocument, SourceEntry } from './types.js';

export interface IndexResult {
  language: string;
  filesDiscovered: number;
  chunksCreated: number;
  indexed: number;
}

export async function indexLanguage(
  lang: string,
  loader: LanguageLoader,
  vectorStore: VectorStore,
  embedding: EmbeddingProvider,
): Promise<IndexResult> {
  const meta = loader.loadLanguageMeta(lang) as Record<string, any> | null;
  const sources = meta?.sources as { stdlib?: SourceEntry[] } | undefined;
  if (!sources?.stdlib?.length) {
    return { language: lang, filesDiscovered: 0, chunksCreated: 0, indexed: 0 };
  }

  const version = (meta?.version as string) || '';
  const files = discoverStdlibFiles(sources.stdlib, version);
  if (files.length === 0) {
    return { language: lang, filesDiscovered: 0, chunksCreated: 0, indexed: 0 };
  }

  const chunks = chunkFiles(lang, files);
  if (chunks.length === 0) {
    return { language: lang, filesDiscovered: files.length, chunksCreated: 0, indexed: 0 };
  }

  const texts = chunks.map(c => `${c.name}: ${c.signature}\n${c.description}`);
  const embeddings = await embedding.embedBatch(texts);

  if (embeddings.length !== chunks.length) {
    throw new Error(`Embedding count mismatch: ${embeddings.length} embeddings for ${chunks.length} chunks`);
  }

  const docs = chunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i],
  }));

  const indexed = await vectorStore.indexLanguage(lang, docs);
  await vectorStore.persist();

  return {
    language: lang,
    filesDiscovered: files.length,
    chunksCreated: chunks.length,
    indexed,
  };
}

export function discoverStdlibFiles(sources: SourceEntry[], version?: string): string[] {
  const files: string[] = [];

  for (const source of sources) {
    if (!source.pattern) continue;
    let pattern = source.pattern.replace(/^~/, os.homedir());
    if (version) {
      pattern = pattern.replace(/\{version\}/g, version);
    }

    try {
      const entries = fs.globSync?.(pattern) ?? globSync(pattern);
      files.push(...entries);
    } catch { /* pattern matched nothing or directory missing */ }
  }

  return [...new Set(files)];
}

// Fallback for Node < 22
function globSync(pattern: string): string[] {
  const results: string[] = [];
  const parts = pattern.split('/');
  const isAbsolute = pattern.startsWith('/');

  let baseIdx = isAbsolute ? 1 : 0;
  let baseParts: string[] = [];
  for (let i = baseIdx; i < parts.length; i++) {
    if (parts[i].includes('*') || parts[i].includes('?')) break;
    baseParts.push(parts[i]);
  }

  const basePath = isAbsolute ? '/' + baseParts.join('/') : baseParts.join('/');
  const rest = parts.slice(baseIdx + baseParts.length).join('/');

  if (!fs.existsSync(basePath)) return results;
  if (!rest || rest === '*') {
    try {
      for (const f of fs.readdirSync(basePath)) {
        const full = path.join(basePath, f);
        if (fs.statSync(full).isFile()) results.push(full);
      }
    } catch { /* ignore */ }
    return results;
  }

  walkDir(basePath, rest, results);
  return results;
}

function walkDir(dir: string, pattern: string, results: string[]): void {
  const patternParts = pattern.split('/');
  const currentPattern = patternParts[0];
  const restPattern = patternParts.slice(1).join('/');

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      if (entry.isDirectory() && restPattern) {
        if (matchGlob(entry.name, currentPattern)) {
          if (restPattern.startsWith('**/')) {
            walkDir(path.join(dir, entry.name), pattern, results);
            walkDir(path.join(dir, entry.name), restPattern.slice(3), results);
          } else {
            walkDir(path.join(dir, entry.name), restPattern, results);
          }
        }
      } else if (entry.isFile() && !restPattern) {
        if (matchGlob(entry.name, currentPattern)) {
          results.push(path.join(dir, entry.name));
        }
      } else if (entry.isFile() && restPattern === '**/*') {
        if (matchGlob(entry.name, currentPattern)) {
          results.push(path.join(dir, entry.name));
        }
      }
    }
  } catch { /* ignore permission errors */ }
}

function matchGlob(name: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '**') return true;
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(name);
}

const CHUNKERS: Record<string, (content: string, lang: string, filename: string) => CodeDocument[]> = {
  typescript: (c, l, f) => chunkDts(c, l, f),
  python: chunkPython,
  zig: chunkZig,
};

export function chunkFiles(lang: string, files: string[]): CodeDocument[] {
  const chunks: CodeDocument[] = [];
  const chunker = CHUNKERS[lang];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (chunker) {
        chunks.push(...chunker(content, lang, path.basename(file)));
      }
    } catch { /* skip unreadable files */ }
  }

  return chunks;
}

function chunkDts(content: string, lang: string, filename: string): CodeDocument[] {
  const chunks: CodeDocument[] = [];
  const moduleName = filename.replace(/\.d\.ts$/, '').replace(/^lib\./, '');

  const interfaceRegex = /(?:export\s+)?interface\s+(\w+)[^{]*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;
  let match: RegExpExecArray | null;

  while ((match = interfaceRegex.exec(content)) !== null) {
    const ifaceName = match[1];
    const body = match[2];

    const methodRegex = /(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*:\s*([^;]+);/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRegex.exec(body)) !== null) {
      const methodName = methodMatch[1];
      if (methodName === 'constructor' || methodName === 'new') continue;

      const params = methodMatch[2].trim();
      const returnType = methodMatch[3].trim();
      const signature = `(${params}): ${returnType}`;

      chunks.push({
        language: lang,
        source: 'stdlib',
        module: ifaceName,
        name: `${ifaceName}.${methodName}`,
        signature,
        description: `${ifaceName}.${methodName} method`,
        code: `${ifaceName}.${methodName}${signature}`,
        tags: [moduleName, ifaceName, methodName],
      });
    }
  }

  const typeRegex = /(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=\s*([^;]+);/g;
  while ((match = typeRegex.exec(content)) !== null) {
    chunks.push({
      language: lang,
      source: 'stdlib',
      module: moduleName,
      name: match[1],
      signature: match[2].trim(),
      description: `Type alias ${match[1]}`,
      code: `type ${match[1]} = ${match[2].trim()}`,
      tags: [moduleName, 'type'],
    });
  }

  return chunks;
}

function chunkPython(content: string, lang: string, filename: string): CodeDocument[] {
  const chunks: CodeDocument[] = [];
  const moduleName = filename.replace(/\.py$/, '');
  const lines = content.split('\n');

  let currentClass = '';
  let currentDocstring = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      currentClass = classMatch[1];
      currentDocstring = extractDocstring(lines, i + 1);
      continue;
    }

    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      if (funcName.startsWith('_') && !funcName.startsWith('__')) continue;

      const signature = `(${funcMatch[2].trim()})`;
      const docstring = extractDocstring(lines, i + 1);
      const fullName = currentClass ? `${currentClass}.${funcName}` : funcName;

      chunks.push({
        language: lang,
        source: 'stdlib',
        module: currentClass || moduleName,
        name: fullName,
        signature,
        description: docstring || currentDocstring || `${fullName} function`,
        code: lines.slice(i, Math.min(i + 20, lines.length)).join('\n').slice(0, 500),
        tags: [moduleName, ...(currentClass ? [currentClass] : []), funcName],
      });
    }
  }

  return chunks;
}

function chunkZig(content: string, lang: string, filename: string): CodeDocument[] {
  const chunks: CodeDocument[] = [];
  const moduleName = filename.replace(/\.zig$/, '');

  const fnRegex = /(?:pub\s+)?fn\s+(\w+)\s*\(([^)]*)\)\s*(?:[a-z]+\s+)?([^{;]+)/g;
  let match: RegExpExecArray | null;
  while ((match = fnRegex.exec(content)) !== null) {
    chunks.push({
      language: lang,
      source: 'stdlib',
      module: moduleName,
      name: match[1],
      signature: `(${match[2].trim()}) ${match[3].trim()}`,
      description: `${match[1]} function`,
      code: match[0],
      tags: [moduleName, match[1]],
    });
  }

  return chunks;
}

function extractDocstring(lines: string[], startIdx: number): string {
  if (startIdx >= lines.length) return '';
  const firstLine = lines[startIdx].trim();
  if (!firstLine.startsWith('"""') && !firstLine.startsWith("'''")) return '';

  const quote = firstLine.startsWith('"""') ? '"""' : "'''";
  const rest = firstLine.slice(quote.length);

  if (rest.includes(quote)) {
    return rest.slice(0, rest.indexOf(quote)).trim();
  }

  const parts: string[] = [rest.trim()];
  for (let i = startIdx + 1; i < lines.length && i < startIdx + 10; i++) {
    const line = lines[i].trim();
    if (line.includes(quote)) {
      parts.push(line.slice(0, line.indexOf(quote)).trim());
      break;
    }
    parts.push(line);
  }
  return parts.join(' ').trim();
}
