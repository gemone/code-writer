import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { EmbeddingConfig } from './types.js';
import { APP_DIR } from './constants.js';

export interface EmbeddingProvider {
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

const CONFIG_PATH = path.join(APP_DIR, 'config.yaml');

const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: 'local',
  model: 'all-MiniLM-L6-v2',
};

export function loadEmbeddingConfig(): EmbeddingConfig {
  try {
    const raw = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
    const emb = raw.embedding as Record<string, unknown> | undefined;
    if (!emb) return DEFAULT_CONFIG;
    return {
      provider: (emb.provider as string) || DEFAULT_CONFIG.provider,
      model: (emb.model as string) || DEFAULT_CONFIG.model,
      apiKey: emb.apiKey as string | undefined,
      baseUrl: emb.baseUrl as string | undefined,
      hfEndpoint: emb.hfEndpoint as string | undefined,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function createEmbeddingProvider(config?: EmbeddingConfig): Promise<EmbeddingProvider> {
  const cfg = config || loadEmbeddingConfig();
  const uri = cfg.provider;

  if (uri === 'local') {
    return new TransformersProvider(cfg.model || 'all-MiniLM-L6-v2', cfg.hfEndpoint);
  }

  if (uri.startsWith('openai://')) {
    const model = uri.slice('openai://'.length);
    return new OpenAIProvider(model, cfg.apiKey, cfg.baseUrl);
  }

  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return new HttpProvider(uri, cfg.apiKey, cfg.dimension);
  }

  throw new Error(`Unknown embedding provider: ${uri}`);
}

class TransformersProvider implements EmbeddingProvider {
  readonly dimension: number;
  private pipeline: any = null;
  private initPromise: Promise<any> | null = null;
  private model: string;
  private hfEndpoint?: string;

  private static MODEL_DIMENSIONS: Record<string, number> = {
    'all-MiniLM-L6-v2': 384,
    'all-MiniLM-L12-v2': 384,
    'bge-small-en-v1.5': 384,
    'bge-base-en-v1.5': 768,
  };

  constructor(model: string, hfEndpoint?: string) {
    this.model = model;
    this.hfEndpoint = hfEndpoint;
    this.dimension = TransformersProvider.MODEL_DIMENSIONS[model] ?? 384;
  }

  private async init() {
    if (this.pipeline) return this.pipeline;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const mod = await Function('return import("@huggingface/transformers")')();

      // Use WASM backend (onnxruntime-web) instead of native onnxruntime-node
      mod.env.backends.onnx = 'wasm';

      // Support HF_ENDPOINT mirror for model downloads (e.g. hf-mirror.com)
      // Priority: env var > config > default
      const hfEndpoint = process.env.HF_ENDPOINT || this.hfEndpoint;
      if (hfEndpoint) {
        mod.env.remoteHost = hfEndpoint;
      }

      const pipeline = mod.pipeline as (task: string, model: string, opts?: Record<string, unknown>) => Promise<any>;
      this.pipeline = await pipeline('feature-extraction', `Xenova/${this.model}`, {
        dtype: 'fp32',
      });
      return this.pipeline;
    })();
    return this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    const pipe = await this.init();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data) as number[];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const batchSize = 8;
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await Promise.all(batch.map(t => this.embed(t)));
      results.push(...embeddings);
    }
    return results;
  }
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API error (${res.status}): ${body}`);
  }
}

abstract class HttpEmbeddingProvider implements EmbeddingProvider {
  abstract readonly dimension: number;
  abstract embed(text: string): Promise<number[]>;
  abstract embedBatch(texts: string[]): Promise<number[][]>;

  constructor(private url: string, private apiKey?: string) {}

  protected async postJson(body: unknown): Promise<any> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    await checkResponse(res);
    return res.json();
  }
}

class OpenAIProvider extends HttpEmbeddingProvider {
  readonly dimension: number;
  private model: string;
  private baseUrl: string;

  constructor(model: string, apiKey?: string, baseUrl?: string) {
    super(`${baseUrl || 'https://api.openai.com/v1'}/embeddings`, apiKey || process.env.OPENAI_API_KEY);
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
    this.model = model;
    this.dimension = model.includes('large') ? 3072 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    const json = await this.postJson({ model: this.model, input: text });
    return json.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const json = await this.postJson({ model: this.model, input: texts });
    return json.data.map((d: any) => d.embedding);
  }
}

class HttpProvider extends HttpEmbeddingProvider {
  readonly dimension: number;

  constructor(url: string, apiKey?: string, dimension?: number) {
    super(url, apiKey);
    this.dimension = dimension || 384;
  }

  async embed(text: string): Promise<number[]> {
    const json = await this.postJson({ input: text });
    if (json.embeddings) return json.embeddings[0];
    if (json.data) return json.data[0]?.embedding || json.data[0];
    return json.embedding || json;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const json = await this.postJson({ input: texts });
    if (json.embeddings) return json.embeddings;
    if (json.data) return json.data.map((d: any) => d.embedding || d);
    return [json.embedding || json];
  }
}
