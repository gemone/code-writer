import { VectorStore } from './vector-store.js';
import { EmbeddingProvider } from './embedding.js';
import { DatabaseManager } from './database.js';
import { DepDocument, DepIndexedDocument } from './types.js';

export interface DepIndexResult {
  depId: string;
  libraryName: string;
  indexed: number;
}

export async function indexDependency(
  depId: string,
  db: DatabaseManager,
  vectorStore: VectorStore,
  embedding: EmbeddingProvider,
): Promise<DepIndexResult> {
  const registry = db.getDepRegistry(depId);
  if (!registry) {
    return { depId, libraryName: depId, indexed: 0 };
  }

  const libraryName = str(registry.library_name);
  const version = str(registry.resolved_version);
  const language = str(registry.language);

  const docs = buildDepDocuments(depId, libraryName, version, language, db);

  if (docs.length === 0) {
    return { depId, libraryName, indexed: 0 };
  }

  const texts = docs.map(d => `${d.name}: ${d.signature}\n${d.description}`);
  const embeddings = await embedding.embedBatch(texts);

  const indexed: DepIndexedDocument[] = docs.map((d, i) => ({
    ...d,
    embedding: embeddings[i],
  }));

  const count = await vectorStore.indexDependency(depId, indexed);
  await vectorStore.persist();

  db.updateDepIndexed(depId, true);

  return { depId, libraryName, indexed: count };
}

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function strArr(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
  return [];
}

function buildDepDocuments(
  depId: string,
  libraryName: string,
  version: string,
  language: string,
  db: DatabaseManager,
): DepDocument[] {
  const docs: DepDocument[] = [];

  for (const api of db.getDepApis(depId)) {
    docs.push({
      library: libraryName,
      version,
      language,
      source: 'api',
      module: str(api.module),
      name: str(api.export_name),
      signature: str(api.signature),
      description: str(api.description),
      code: str(api.example),
      tags: strArr(api.tags),
    });
  }

  for (const pattern of db.getDepPatterns(depId)) {
    docs.push({
      library: libraryName,
      version,
      language,
      source: 'pattern',
      module: '',
      name: str(pattern.name),
      signature: '',
      description: str(pattern.description),
      code: str(pattern.code_example),
      tags: strArr(pattern.tags),
    });
  }

  for (const consideration of db.getDepConsiderations(depId)) {
    docs.push({
      library: libraryName,
      version,
      language,
      source: 'consideration',
      module: '',
      name: str(consideration.title),
      signature: '',
      description: str(consideration.description),
      code: str(consideration.fix_suggestion),
      tags: [str(consideration.category), str(consideration.severity)].filter(Boolean),
    });
  }

  return docs;
}
