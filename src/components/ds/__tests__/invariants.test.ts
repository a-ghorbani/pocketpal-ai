/**
 * Grep-based invariants for the DS component layer.
 *
 * Coverage:
 *   - DS layer is observation-free: no file under `src/components/ds/`
 *     imports `mobx`, `mobx-react`, or any store module.
 *   - Sheet / Modal / Dialog compose the `Header` building block.
 *   - No production file imports the Paper `Surface` symbol — DS
 *     consumers must import `Surface` from `src/components/ds`.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', '..', '..', 'src');
const DS = path.join(SRC, 'components', 'ds');

function listFiles(
  dir: string,
  predicate: (filename: string) => boolean,
  out: string[] = [],
): string[] {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === '__tests__' || entry.name === '__mocks__') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, predicate, out);
    } else if (predicate(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\/])\/\/.*$/gm, '$1');
}

describe('DS layer grep invariants', () => {
  describe('DS layer is observation-free (no mobx, no store imports)', () => {
    const files = listFiles(DS, n => /\.(ts|tsx)$/.test(n));

    it('walks at least one DS file (sanity check)', () => {
      expect(files.length).toBeGreaterThan(10);
    });

    it('no DS file imports mobx, mobx-react, or a store module', () => {
      // Patterns are scoped to `from '...'` so we only catch actual
      // import statements, not incidental string matches in comments
      // or test fixtures (the walker also skips __tests__).
      const offendingPatterns: Array<{name: string; re: RegExp}> = [
        {name: 'mobx', re: /from\s+['"]mobx['"]/},
        {name: 'mobx-react', re: /from\s+['"]mobx-react['"]/},
        {name: 'mobx-react-lite', re: /from\s+['"]mobx-react-lite['"]/},
        {name: 'store import', re: /from\s+['"][^'"]*\/store['"]/},
        {name: 'store import', re: /from\s+['"][^'"]*\/store\/[^'"]+['"]/},
      ];
      const offenders: Array<{file: string; match: string}> = [];
      for (const file of files) {
        const code = stripComments(fs.readFileSync(file, 'utf-8'));
        for (const {name, re} of offendingPatterns) {
          const m = code.match(re);
          if (m) {
            offenders.push({file, match: `${name}: ${m[0]}`});
            break;
          }
        }
      }
      if (offenders.length > 0) {
        const detail = offenders
          .map(o => `  - ${path.relative(SRC, o.file)}: ${o.match}`)
          .join('\n');
        throw new Error(
          `DS file(s) violate observation-free invariant:\n${detail}`,
        );
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('Sheet / Modal / Dialog compose the Header building block', () => {
    const overlayFiles = [
      path.join(DS, 'Sheet', 'Sheet.tsx'),
      path.join(DS, 'Modal', 'Modal.tsx'),
      path.join(DS, 'Dialog', 'Dialog.tsx'),
    ];

    it.each(overlayFiles)(
      '%s imports Header and renders a <Header ...> JSX tag',
      file => {
        const code = stripComments(fs.readFileSync(file, 'utf-8'));
        // Header must be imported from the sibling DS Header module.
        expect(code).toMatch(/from\s+['"]\.\.\/Header['"]/);
        // And used as a JSX tag (self-closing or with children).
        expect(code).toMatch(/<Header(\s|\/|>)/);
      },
    );
  });

  describe('Paper `Surface` is not imported outside the wrap-Paper carve-outs', () => {
    // No Paper Surface import anywhere in `src/`. If a future PR
    // legitimately needs one, the carve-out belongs both here and in
    // the ESLint config.
    const files = listFiles(SRC, n => /\.(ts|tsx)$/.test(n));

    it('walks a meaningful slice of `src/` (sanity check)', () => {
      expect(files.length).toBeGreaterThan(50);
    });

    it("no production file imports { Surface } from 'react-native-paper'", () => {
      const offenders: Array<{file: string; match: string}> = [];
      // Match an import statement that pulls in `Surface` (possibly
      // aliased, possibly alongside other symbols) from
      // `react-native-paper`. We intentionally don't try to catch the
      // pathological `import * as RNP from 'react-native-paper';
      // RNP.Surface` access pattern — ESLint already covers it via
      // `no-restricted-syntax` if needed, and no such pattern exists
      // in the codebase today.
      const importRe =
        /import\s*\{[^}]*\bSurface\b[^}]*\}\s*from\s*['"]react-native-paper['"]/;
      for (const file of files) {
        const code = stripComments(fs.readFileSync(file, 'utf-8'));
        const m = code.match(importRe);
        if (m) {
          offenders.push({file, match: m[0]});
        }
      }
      if (offenders.length > 0) {
        const detail = offenders
          .map(o => `  - ${path.relative(SRC, o.file)}: ${o.match}`)
          .join('\n');
        throw new Error(
          `Paper Surface import(s) found — must import from src/components/ds instead:\n${detail}`,
        );
      }
      expect(offenders).toEqual([]);
    });
  });
});
