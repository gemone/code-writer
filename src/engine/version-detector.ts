import fs from 'node:fs';
import path from 'node:path';
import type { ProjectDependencies, DetectedDependency } from './types.js';

export function detectProjectDependencies(projectRoot: string): ProjectDependencies[] {
  const results: ProjectDependencies[] = [];

  // package.json (Node/TS)
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    results.push(parsePackageJson(projectRoot, pkgJsonPath));
  }

  // requirements.txt (Python)
  const reqTxtPath = path.join(projectRoot, 'requirements.txt');
  if (fs.existsSync(reqTxtPath)) {
    results.push(parseRequirementsTxt(reqTxtPath));
  }

  // pyproject.toml (Python)
  const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    results.push(parsePyprojectToml(pyprojectPath));
  }

  // go.mod
  const goModPath = path.join(projectRoot, 'go.mod');
  if (fs.existsSync(goModPath)) {
    results.push(parseGoMod(goModPath));
  }

  // Cargo.toml (Rust)
  const cargoPath = path.join(projectRoot, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    results.push(parseCargoToml(cargoPath));
  }

  return results;
}

// --- package.json ---

function parsePackageJson(projectRoot: string, pkgJsonPath: string): ProjectDependencies {
  const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
  const pkg = JSON.parse(raw);
  const deps: DetectedDependency[] = [];

  const isTS = fs.existsSync(path.join(projectRoot, 'tsconfig.json'));
  const language = isTS ? 'typescript' : 'javascript';

  // Parse package-lock.json once for all dependency resolution
  const lockPath = path.join(projectRoot, 'package-lock.json');
  let lockData: Record<string, any> | null = null;
  if (fs.existsSync(lockPath)) {
    try { lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8')); } catch { /* fall through */ }
  }

  for (const section of ['dependencies', 'devDependencies'] as const) {
    const entries = pkg[section] as Record<string, string> | undefined;
    if (!entries) continue;
    for (const [name, version] of Object.entries(entries)) {
      const resolved = resolveNpmVersion(projectRoot, name, lockData);
      deps.push({
        name,
        version: resolved || version,
        language,
        packageManager: 'npm',
        scope: section === 'devDependencies' ? 'dev' : undefined,
      });
    }
  }

  return { language, packageManager: 'npm', manifestPath: pkgJsonPath, dependencies: deps };
}

function resolveNpmVersion(projectRoot: string, pkgName: string, lockData: Record<string, any> | null): string | undefined {
  // Try node_modules/<pkg>/package.json
  const modPkg = path.join(projectRoot, 'node_modules', pkgName, 'package.json');
  if (fs.existsSync(modPkg)) {
    try {
      const mod = JSON.parse(fs.readFileSync(modPkg, 'utf-8'));
      return mod.version;
    } catch { /* fall through */ }
  }

  // Use pre-parsed package-lock.json
  if (lockData) {
    const entry = lockData.packages?.[`node_modules/${pkgName}`] || lockData.dependencies?.[pkgName];
    if (entry?.version) return entry.version;
  }

  return undefined;
}

// --- requirements.txt ---

function parseRequirementsTxt(reqPath: string): ProjectDependencies {
  const lines = fs.readFileSync(reqPath, 'utf-8').split('\n');
  const deps: DetectedDependency[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*([><=!~]+[\d.]*)?\s*/);
    if (match) {
      deps.push({
        name: match[1],
        version: match[2] || '',
        language: 'python',
        packageManager: 'pip',
      });
    }
  }

  return { language: 'python', packageManager: 'pip', manifestPath: reqPath, dependencies: deps };
}

// --- pyproject.toml ---

function parsePyprojectToml(tomlPath: string): ProjectDependencies {
  const raw = fs.readFileSync(tomlPath, 'utf-8');
  const deps: DetectedDependency[] = [];

  // Extract [project] dependencies array
  const projectMatch = raw.match(/\[project\][\s\S]*?(?=\n\[|$)/);
  if (!projectMatch) {
    return { language: 'python', packageManager: 'pip', manifestPath: tomlPath, dependencies: deps };
  }

  const projectSection = projectMatch[0];
  // Find dependencies = [...] block
  const depsMatch = projectSection.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depsMatch) {
    const depsRaw = depsMatch[1];
    // Parse quoted strings from the array
    const entries = depsRaw.match(/"([^"]+)"/g) || [];
    for (const entry of entries) {
      const cleaned = entry.replace(/"/g, '');
      const parsed = parsePep508(cleaned);
      if (parsed) deps.push(parsed);
    }
  }

  return { language: 'python', packageManager: 'pip', manifestPath: tomlPath, dependencies: deps };
}

function parsePep508(spec: string): DetectedDependency | undefined {
  const match = spec.match(/^([A-Za-z0-9_.-]+)\s*([><=!~]+[\d.,<>=!~\s]+)?/);
  if (!match) return undefined;
  return {
    name: match[1],
    version: match[2]?.trim() || '',
    language: 'python',
    packageManager: 'pip',
  };
}

// --- go.mod ---

function parseGoMod(goModPath: string): ProjectDependencies {
  const raw = fs.readFileSync(goModPath, 'utf-8');
  const deps: DetectedDependency[] = [];

  // Parse require block: require ( ... ) or single-line require
  const requireBlockMatch = raw.match(/require\s*\(([\s\S]*?)\)/);
  if (requireBlockMatch) {
    const lines = requireBlockMatch[1].split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^([\w./-]+)\s+(v[\d.]+\S*)/);
      if (match) {
        deps.push({
          name: match[1],
          version: match[2],
          language: 'go',
          packageManager: 'go modules',
        });
      }
    }
  }

  // Single-line require: require module v1.2.3
  const singleRequires = raw.matchAll(/require\s+([\w./-]+)\s+(v[\d.]+\S*)/g);
  for (const match of singleRequires) {
    if (!deps.some(d => d.name === match[1])) {
      deps.push({
        name: match[1],
        version: match[2],
        language: 'go',
        packageManager: 'go modules',
      });
    }
  }

  return { language: 'go', packageManager: 'go modules', manifestPath: goModPath, dependencies: deps };
}

// --- Cargo.toml ---

function parseCargoToml(cargoPath: string): ProjectDependencies {
  const raw = fs.readFileSync(cargoPath, 'utf-8');
  const deps: DetectedDependency[] = [];

  // Extract [dependencies] section
  const depMatch = raw.match(/\[dependencies\]([\s\S]*?)(?=\n\[|$)/);
  if (depMatch) {
    const section = depMatch[1];
    const lines = section.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Table format: name = { version = "x", ... }
      const tableMatch = trimmed.match(/^(\w[\w-]*)\s*=\s*\{[^}]*version\s*=\s*"([^"]*)"/);
      if (tableMatch) {
        deps.push({
          name: tableMatch[1],
          version: tableMatch[2],
          language: 'rust',
          packageManager: 'cargo',
        });
        continue;
      }

      // Shorthand: name = "version"
      const shortMatch = trimmed.match(/^(\w[\w-]*)\s*=\s*"([^"]*)"/);
      if (shortMatch) {
        deps.push({
          name: shortMatch[1],
          version: shortMatch[2],
          language: 'rust',
          packageManager: 'cargo',
        });
      }
    }
  }

  return { language: 'rust', packageManager: 'cargo', manifestPath: cargoPath, dependencies: deps };
}
