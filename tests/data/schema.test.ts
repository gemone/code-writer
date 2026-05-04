import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  LanguageRegistrySchema,
  StdlibSchema,
  SyntaxSchema,
  ConventionsSchema,
  PatternsSchema,
  LanguageMetaSchema,
} from '../../src/engine/types.js';

const dataDir = path.resolve(__dirname, '../../data');

describe('Zod Schema Validation', () => {
  describe('LanguageRegistrySchema', () => {
    it('should parse index.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(dataDir, 'index.yaml'), 'utf-8'));
      const result = LanguageRegistrySchema.parse(raw);
      expect(result.languages).toHaveProperty('typescript');
      expect(result.languages).toHaveProperty('python');
    });
  });

  describe('TypeScript data files', () => {
    const tsDir = path.join(dataDir, 'typescript');

    it('should parse language.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(tsDir, 'language.yaml'), 'utf-8'));
      const result = LanguageMetaSchema.parse(raw);
      expect(result.name).toBe('TypeScript');
    });

    it('should parse stdlib.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(tsDir, 'stdlib.yaml'), 'utf-8'));
      const result = StdlibSchema.parse(raw);
      expect(result.modules.length).toBeGreaterThan(0);
      expect(result.modules[0].methods.length).toBeGreaterThan(0);
    });

    it('should parse syntax.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(tsDir, 'syntax.yaml'), 'utf-8'));
      const result = SyntaxSchema.parse(raw);
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it('should parse conventions.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(tsDir, 'conventions.yaml'), 'utf-8'));
      const result = ConventionsSchema.parse(raw);
      expect(result.conventions.length).toBeGreaterThan(0);
    });

    it('should parse patterns.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(tsDir, 'patterns.yaml'), 'utf-8'));
      const result = PatternsSchema.parse(raw);
      expect(result.patterns.length).toBeGreaterThan(0);
    });
  });

  describe('Python data files', () => {
    const pyDir = path.join(dataDir, 'python');

    it('should parse language.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(pyDir, 'language.yaml'), 'utf-8'));
      const result = LanguageMetaSchema.parse(raw);
      expect(result.name).toBe('Python');
    });

    it('should parse stdlib.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(pyDir, 'stdlib.yaml'), 'utf-8'));
      const result = StdlibSchema.parse(raw);
      expect(result.modules.length).toBeGreaterThan(0);
    });

    it('should parse syntax.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(pyDir, 'syntax.yaml'), 'utf-8'));
      const result = SyntaxSchema.parse(raw);
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it('should parse conventions.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(pyDir, 'conventions.yaml'), 'utf-8'));
      const result = ConventionsSchema.parse(raw);
      expect(result.conventions.length).toBeGreaterThan(0);
    });

    it('should parse patterns.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(pyDir, 'patterns.yaml'), 'utf-8'));
      const result = PatternsSchema.parse(raw);
      expect(result.patterns.length).toBeGreaterThan(0);
    });
  });

  describe('Zig data files', () => {
    const zigDir = path.join(dataDir, 'zig');

    it('should parse language.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(zigDir, 'language.yaml'), 'utf-8'));
      const result = LanguageMetaSchema.parse(raw);
      expect(result.name).toBe('Zig');
    });

    it('should parse stdlib.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(zigDir, 'stdlib.yaml'), 'utf-8'));
      const result = StdlibSchema.parse(raw);
      expect(result.modules.length).toBeGreaterThan(0);
    });

    it('should parse syntax.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(zigDir, 'syntax.yaml'), 'utf-8'));
      const result = SyntaxSchema.parse(raw);
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it('should parse conventions.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(zigDir, 'conventions.yaml'), 'utf-8'));
      const result = ConventionsSchema.parse(raw);
      expect(result.conventions.length).toBeGreaterThan(0);
    });

    it('should parse patterns.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(zigDir, 'patterns.yaml'), 'utf-8'));
      const result = PatternsSchema.parse(raw);
      expect(result.patterns.length).toBeGreaterThan(0);
    });
  });

  describe('_shared patterns', () => {
    it('should parse _shared/patterns.yaml with unified format', () => {
      const raw = yaml.load(fs.readFileSync(path.join(dataDir, '_shared/patterns.yaml'), 'utf-8'));
      const result = PatternsSchema.parse(raw);
      expect(result.patterns.length).toBeGreaterThan(0);
      for (const p of result.patterns) {
        expect(p.name).toBeDefined();
        expect(p.description).toBeDefined();
      }
    });
  });

  describe('_template files', () => {
    it('should parse _template/language.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(dataDir, '_template/language.yaml'), 'utf-8'));
      const result = LanguageMetaSchema.parse(raw);
      expect(result.name).toBeDefined();
    });

    it('should parse _template/stdlib.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(dataDir, '_template/stdlib.yaml'), 'utf-8'));
      const result = StdlibSchema.parse(raw);
      expect(result.modules.length).toBeGreaterThan(0);
    });

    it('should parse _template/syntax.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(dataDir, '_template/syntax.yaml'), 'utf-8'));
      const result = SyntaxSchema.parse(raw);
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it('should parse _template/conventions.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(dataDir, '_template/conventions.yaml'), 'utf-8'));
      const result = ConventionsSchema.parse(raw);
      expect(result.conventions.length).toBeGreaterThan(0);
    });

    it('should parse _template/patterns.yaml', () => {
      const raw = yaml.load(fs.readFileSync(path.join(dataDir, '_template/patterns.yaml'), 'utf-8'));
      const result = PatternsSchema.parse(raw);
      expect(result.patterns.length).toBeGreaterThan(0);
    });
  });
});
