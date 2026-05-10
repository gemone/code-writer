import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, type MessageConnection } from 'vscode-jsonrpc/node.js';
import type { Position, Location, DocumentSymbol } from 'vscode-languageserver-protocol';

// --- Types ---

export interface HoverResult {
  contents: string;
  range?: { start: Position; end: Position };
}

export interface DiagnosticItem {
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  source?: string;
}

// --- Server Commands ---

const SERVER_COMMANDS: Record<string, string[]> = {
  typescript: ['typescript-language-server', '--stdio'],
  javascript: ['typescript-language-server', '--stdio'],
  tsx: ['typescript-language-server', '--stdio'],
  python: ['pyright-langserver', '--stdio'],
};

const LANGUAGE_ID_MAP: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'javascript',
  tsx: 'typescriptreact',
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
};

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// --- LspConnection ---

interface LspConnection {
  key: string;
  process: ChildProcess;
  connection: MessageConnection;
  openFiles: Set<string>;
  idleTimer: ReturnType<typeof setTimeout>;
}

// --- LspClientManager ---

export class LspClientManager {
  private connections = new Map<string, LspConnection>();

  async getClient(language: string, rootUri: string): Promise<LspClient> {
    const key = `${language}:${rootUri}`;
    const existing = this.connections.get(key);
    if (existing) {
      this.resetIdleTimer(existing);
      return new LspClient(existing, rootUri, LANGUAGE_ID_MAP[language] || language);
    }

    const conn = await this.spawnServer(language, rootUri);
    this.connections.set(key, conn);
    return new LspClient(conn, rootUri, LANGUAGE_ID_MAP[language] || language);
  }

  async shutdownAll(): Promise<void> {
    for (const [key, conn] of this.connections) {
      clearTimeout(conn.idleTimer);
      try {
        await conn.connection.sendRequest('shutdown');
        conn.connection.sendNotification('exit');
      } catch { /* ignore */ }
      conn.process.kill();
      this.connections.delete(key);
    }
  }

  private async spawnServer(language: string, rootUri: string): Promise<LspConnection> {
    const command = SERVER_COMMANDS[language];
    if (!command) {
      throw new Error(`No LSP server configured for language: ${language}. Supported: ${Object.keys(SERVER_COMMANDS).join(', ')}`);
    }

    const childProcess = spawn(command[0], command.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: UriToPath(rootUri),
    });

    // Wait for the process to actually spawn (or fail) before using streams
    await new Promise<void>((resolve, reject) => {
      childProcess.on('error', reject);
      childProcess.on('spawn', resolve);
    }).catch(err => {
      throw new Error(`Failed to start LSP server ${command.join(' ')}: ${err instanceof Error ? err.message : String(err)}. Is ${command[0]} installed?`);
    });

    if (!childProcess.stdin || !childProcess.stdout) {
      throw new Error(`Failed to create stdio streams for LSP server: ${command.join(' ')}`);
    }

    const writer = new StreamMessageWriter(childProcess.stdin);
    // Prevent unhandled write errors when process dies mid-connection
    writer.onError(() => {});

    const connection = createMessageConnection(
      new StreamMessageReader(childProcess.stdout),
      writer,
    );
    connection.onError(() => { /* swallow connection errors */ });
    connection.onClose(() => { /* connection closed */ });
    connection.listen();

    try {
      await connection.sendRequest('initialize', {
        processId: process.pid,
        rootUri,
        capabilities: {
          textDocument: {
            hover: { contentFormat: ['plaintext'] },
            definition: { linkSupport: false },
            references: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          },
        },
      });
    } catch (err) {
      childProcess.kill();
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to initialize LSP server ${command.join(' ')}: ${msg}. Is ${command[0]} installed?`);
    }

    connection.sendNotification('initialized', {});

    const key = `${language}:${rootUri}`;
    const conn: LspConnection = {
      key,
      process: childProcess,
      connection,
      openFiles: new Set(),
      idleTimer: setTimeout(() => this.closeConnection(key), IDLE_TIMEOUT_MS),
    };

    childProcess.on('error', () => {
      this.connections.delete(key);
    });
    childProcess.on('exit', () => {
      this.connections.delete(key);
    });

    return conn;
  }

  private resetIdleTimer(conn: LspConnection): void {
    clearTimeout(conn.idleTimer);
    conn.idleTimer = setTimeout(() => {
      this.closeConnection(conn.key);
    }, IDLE_TIMEOUT_MS);
  }

  private async closeConnection(key: string): Promise<void> {
    const conn = this.connections.get(key);
    if (!conn) return;
    try {
      await conn.connection.sendRequest('shutdown');
      conn.connection.sendNotification('exit');
    } catch { /* ignore */ }
    conn.process.kill();
    this.connections.delete(key);
  }
}

// --- LspClient ---

class LspClient {
  constructor(
    private conn: LspConnection,
    private rootUri: string,
    private languageId: string,
  ) {}

  async hover(filePath: string, line: number, character: number): Promise<HoverResult | null> {
    await this.ensureOpen(filePath);
    const result: any = await this.conn.connection.sendRequest('textDocument/hover', {
      textDocument: { uri: pathToUri(filePath) },
      position: { line: line - 1, character: character - 1 },
    });
    if (!result) return null;

    let contents = '';
    if (typeof result.contents === 'string') {
      contents = result.contents;
    } else if (Array.isArray(result.contents)) {
      contents = result.contents.map((c: any) => typeof c === 'string' ? c : c.value || '').join('\n');
    } else if (typeof result.contents === 'object' && 'value' in result.contents) {
      contents = result.contents.value;
    }

    return { contents, range: result.range };
  }

  async definition(filePath: string, line: number, character: number): Promise<Location[]> {
    await this.ensureOpen(filePath);
    const result: any = await this.conn.connection.sendRequest('textDocument/definition', {
      textDocument: { uri: pathToUri(filePath) },
      position: { line: line - 1, character: character - 1 },
    });
    if (!result) return [];
    if (Array.isArray(result)) return result.map(normalizeLocation);
    return [normalizeLocation(result)];
  }

  async references(filePath: string, line: number, character: number): Promise<Location[]> {
    await this.ensureOpen(filePath);
    const result: any = await this.conn.connection.sendRequest('textDocument/references', {
      textDocument: { uri: pathToUri(filePath) },
      position: { line: line - 1, character: character - 1 },
      context: { includeDeclaration: true },
    });
    return (result || []).map(normalizeLocation);
  }

  async diagnostics(_filePath: string): Promise<DiagnosticItem[]> {
    // Pull diagnostics (textDocument/diagnostic) is LSP 3.17+
    // Most servers publish via notification; return empty for now
    return [];
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbol[]> {
    await this.ensureOpen(filePath);
    const result: any = await this.conn.connection.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: pathToUri(filePath) },
    });
    if (!result) return [];
    return result as DocumentSymbol[];
  }

  private async ensureOpen(filePath: string): Promise<void> {
    const uri = pathToUri(filePath);
    if (this.conn.openFiles.has(uri)) return;

    let text: string;
    try {
      text = await readFile(filePath, 'utf-8');
    } catch {
      throw new Error(`Cannot read file: ${filePath}`);
    }

    this.conn.connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.languageId,
        version: 1,
        text,
      },
    });
    this.conn.openFiles.add(uri);
  }
}

// --- Helpers ---

function pathToUri(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

function UriToPath(uri: string): string {
  if (uri.startsWith('file://')) return fileURLToPath(uri);
  return uri;
}

function normalizeLocation(loc: any): Location {
  return {
    uri: loc.uri,
    range: loc.range,
  };
}
