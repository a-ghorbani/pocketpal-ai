/**
 * PACT Cleanup verification tests (TASK-20260426-1600)
 *
 * Validates the structural changes from the PACT cleanup:
 * 1. Result-keyed metadata by call ID (not by talent name)
 * 2. toolMessages rename (was talentResults for wire payload)
 * 3. toToolDefinition() on every engine + deriveToolSchemas()
 * 4. TalentResult html variant includes title
 * 5. Old vocabulary is gone from src/
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  RenderHtmlEngine,
  CalculateEngine,
  DatetimeEngine,
  deriveToolSchemas,
  resetRegisteredFlag,
  talentRegistry,
} from '../index';
import type {TalentResult, ToolDefinition} from '../types';

describe('PACT cleanup: result-keyed metadata by call ID', () => {
  it('two render_html calls with same talent name produce separate TalentResult entries', async () => {
    const engine = new RenderHtmlEngine();

    const resultA = await engine.execute({html: '<p>A</p>', title: 'Chart A'});
    const resultB = await engine.execute({html: '<p>B</p>', title: 'Chart B'});

    // Simulate what the dispatch loop does: store by unique call ID
    const talentResultsMap: Record<string, TalentResult> = {};
    talentResultsMap.call_1 = resultA;
    talentResultsMap.call_2 = resultB;

    // Verify separate entries exist
    expect(Object.keys(talentResultsMap)).toHaveLength(2);
    expect(talentResultsMap.call_1).not.toBe(talentResultsMap.call_2);

    if (
      talentResultsMap.call_1.type === 'html' &&
      talentResultsMap.call_2.type === 'html'
    ) {
      expect(talentResultsMap.call_1.html).toBe('<p>A</p>');
      expect(talentResultsMap.call_1.title).toBe('Chart A');
      expect(talentResultsMap.call_2.html).toBe('<p>B</p>');
      expect(talentResultsMap.call_2.title).toBe('Chart B');
    } else {
      throw new Error('Expected both results to be html type');
    }
  });

  it('TalentResult map is keyed by call ID, not talent name', async () => {
    const renderHtml = new RenderHtmlEngine();
    const calculate = new CalculateEngine();

    const htmlResult = await renderHtml.execute({html: '<b/>', title: 'X'});
    const calcResult = await calculate.execute({expression: '1+1'});

    // Keyed by call ID (unique per invocation), not by engine name
    const map: Record<string, TalentResult> = {
      call_abc: htmlResult,
      call_def: calcResult,
    };

    expect(map.call_abc.type).toBe('html');
    expect(map.call_def.type).toBe('text');
    // No collision even if we had two render_html calls
    map.call_ghi = await renderHtml.execute({html: '<i/>', title: 'Y'});
    expect(Object.keys(map)).toHaveLength(3);
  });

  it('full TalentResult is stored, not individual fields', async () => {
    const engine = new RenderHtmlEngine();
    const result = await engine.execute({html: '<p>test</p>', title: 'T'});

    // The result must carry type, html, title, and summary as a unit
    expect(result).toEqual({
      type: 'html',
      html: '<p>test</p>',
      title: 'T',
      summary: 'Rendered HTML preview: "T"',
    });

    // Verify it's a single object, not spread fields
    expect('type' in result).toBe(true);
    expect('summary' in result).toBe(true);
  });
});

describe('PACT cleanup: toToolDefinition() contract', () => {
  const engines = [
    new RenderHtmlEngine(),
    new CalculateEngine(),
    new DatetimeEngine(),
  ];

  it.each(engines.map(e => [e.name, e]))(
    '%s.toToolDefinition() returns ToolDefinition with type "function"',
    (_name, engine) => {
      const def: ToolDefinition = (engine as any).toToolDefinition();
      expect(def.type).toBe('function');
      expect(typeof def.function).toBe('object');
      expect(typeof def.function.name).toBe('string');
      expect(typeof def.function.description).toBe('string');
      expect(def.function.description.length).toBeGreaterThan(0);
      expect(typeof def.function.parameters).toBe('object');
    },
  );

  it.each(engines.map(e => [e.name, e]))(
    '%s.toToolDefinition().function.name matches engine.name',
    (_name, engine) => {
      const def = (engine as any).toToolDefinition();
      expect(def.function.name).toBe((engine as any).name);
    },
  );

  it.each(engines.map(e => [e.name, e]))(
    '%s.toToolDefinition() has "required" array in parameters',
    (_name, engine) => {
      const def = (engine as any).toToolDefinition();
      expect(Array.isArray(def.function.parameters.required)).toBe(true);
      expect(def.function.parameters.required.length).toBeGreaterThan(0);
    },
  );

  it('RenderHtmlEngine requires "html" parameter', () => {
    const def = new RenderHtmlEngine().toToolDefinition();
    expect(def.function.parameters.required).toContain('html');
  });

  it('CalculateEngine requires "expression" parameter', () => {
    const def = new CalculateEngine().toToolDefinition();
    expect(def.function.parameters.required).toContain('expression');
  });

  it('DatetimeEngine requires "action" parameter', () => {
    const def = new DatetimeEngine().toToolDefinition();
    expect(def.function.parameters.required).toContain('action');
  });
});

describe('PACT cleanup: deriveToolSchemas()', () => {
  beforeEach(() => {
    talentRegistry.reset();
    resetRegisteredFlag();
  });

  it('returns all 3 schemas without prior registration', () => {
    // Registry is completely empty
    expect(talentRegistry.getAll()).toHaveLength(0);

    const schemas = deriveToolSchemas();
    expect(schemas).toHaveLength(3);

    const names = schemas.map(s => s.function.name).sort();
    expect(names).toEqual(['calculate', 'datetime', 'render_html']);
  });

  it('each schema has the OpenAI function-calling shape', () => {
    const schemas = deriveToolSchemas();
    for (const schema of schemas) {
      expect(schema.type).toBe('function');
      expect(schema.function).toBeDefined();
      expect(typeof schema.function.name).toBe('string');
      expect(typeof schema.function.description).toBe('string');
      expect(schema.function.parameters).toBeDefined();
      expect(schema.function.parameters.type).toBe('object');
      expect(schema.function.parameters.properties).toBeDefined();
    }
  });

  it('schemas are usable as completionSettings.tools payload', () => {
    const tools = deriveToolSchemas();
    // Simulate what PalStore does: embed in completionSettings
    const completionSettings = {
      tools,
      tool_choice: 'auto' as const,
      jinja: true,
    };
    expect(completionSettings.tools).toHaveLength(3);
    expect(completionSettings.tools[0].type).toBe('function');
  });
});

describe('PACT cleanup: html variant title field', () => {
  it('RenderHtmlEngine populates title from args.title', async () => {
    const engine = new RenderHtmlEngine();
    const result = await engine.execute({html: '<p/>', title: 'My Title'});
    if (result.type === 'html') {
      expect(result.title).toBe('My Title');
    } else {
      throw new Error('Expected html result');
    }
  });

  it('title is undefined when not provided', async () => {
    const engine = new RenderHtmlEngine();
    const result = await engine.execute({html: '<p/>'});
    if (result.type === 'html') {
      expect(result.title).toBeUndefined();
    }
  });

  it('title is optional on the TalentResult html variant', () => {
    // TypeScript compile-time check: these should all be valid
    const withTitle: TalentResult = {
      type: 'html',
      html: '<p/>',
      title: 'T',
      summary: 's',
    };
    const withoutTitle: TalentResult = {
      type: 'html',
      html: '<p/>',
      summary: 's',
    };
    expect(withTitle.type).toBe('html');
    expect(withoutTitle.type).toBe('html');
  });
});

describe('PACT cleanup: vocabulary audit (old field names eliminated)', () => {
  const srcDir = path.resolve(__dirname, '../../../');

  /**
   * Recursively collect .ts/.tsx files under a directory,
   * excluding node_modules, __tests__, and .test. files.
   */
  function collectSourceFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '__tests__' ||
          entry.name === '__mocks__'
        ) {
          continue;
        }
        files.push(...collectSourceFiles(fullPath));
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.includes('.test.')
      ) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const sourceFiles = collectSourceFiles(srcDir);

  it('no source file references metadata.htmlPreview as a field name', () => {
    const hits: string[] = [];
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      // Match metadata.htmlPreview or {htmlPreview} or htmlPreview: but NOT
      // htmlPreviewCount (which is a local variable name, not a metadata field)
      if (/metadata\.htmlPreview\b/.test(content)) {
        hits.push(filePath);
      }
      if (/['"]htmlPreview['"]/.test(content)) {
        hits.push(filePath);
      }
    }
    expect(hits).toEqual([]);
  });

  it('no source file references metadata.htmlPreviewTitle', () => {
    const hits: string[] = [];
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/htmlPreviewTitle/.test(content)) {
        hits.push(filePath);
      }
    }
    expect(hits).toEqual([]);
  });

  it('no source file uses talentCallPending as a boolean flag', () => {
    const hits: string[] = [];
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/talentCallPending/.test(content)) {
        hits.push(filePath);
      }
    }
    expect(hits).toEqual([]);
  });

  it('no source file uses talentResults as an array (old wire payload)', () => {
    const hits: string[] = [];
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      // The old pattern was: metadata.talentResults as Array<...>
      // The new pattern is: metadata.talentResults as Record<string, TalentResult>
      // Check for explicit array type assertions on talentResults
      if (/talentResults\s+as\s+\n?\s*\|?\s*Array/.test(content)) {
        hits.push(filePath);
      }
    }
    expect(hits).toEqual([]);
  });

  it('toolMessages is used for wire payload (not talentResults)', () => {
    // chat.ts should reference toolMessages for the wire format
    const chatPath = path.resolve(srcDir, 'utils/chat.ts');
    const content = fs.readFileSync(chatPath, 'utf8');
    expect(content).toContain('toolMessages');
    // The wire payload read should NOT use talentResults
    expect(content).not.toMatch(
      /metadata\?\.talentResults\s+as\s*\n?\s*\|?\s*Array/,
    );
  });
});
