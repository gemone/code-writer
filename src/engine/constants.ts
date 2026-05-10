import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export const APP_DIR = path.join(os.homedir(), '.code-writer');
export const DATA_DIR = path.join(APP_DIR, 'data');

/**
 * Copy bundled seed data to DATA_DIR on first run.
 * Non-destructive: only copies files that don't already exist.
 */
export function ensureDataDir(bundledDir?: string, destDir?: string): string {
  const src = bundledDir || path.resolve(__dirname, '../../data');
  const dest = destDir || DATA_DIR;

  fs.mkdirSync(dest, { recursive: true });

  if (!fs.existsSync(src)) return dest;

  fs.cpSync(src, dest, {
    recursive: true,
    filter: (srcPath, dst) => !fs.existsSync(dst) || fs.statSync(srcPath).isDirectory(),
  });
  return dest;
}
