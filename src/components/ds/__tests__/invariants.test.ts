/**
 * Grep-based invariants for the DS component layer (FOU-115 Phase 2).
 *
 * Companion to `src/theme/tokens/__tests__/invariants.test.ts` — same
 * pattern (recursive `src/components/ds` walk, comment-stripped match)
 * applied to the contract that WHAT §4j sets out.
 *
 * Coverage:
 *   - I_DS2: no file under `src/components/ds/` imports `mobx`,
 *     `mobx-react`, or any store module. The DS layer is
 *     observation-free; state integration is the consumer's job.
 *   - I_DS3: `Sheet`, `Modal`, and `Dialog` compose the `Header`
 *     building block (no inline header markup). Caught by asserting
 *     each overlay file imports `Header` and uses it as a JSX tag.
 *   - Scenario I' permanent regression: outside the three wrap-Paper
 *     DS files (Switch / Checkbox / RadioButton) and the locked
 *     thin set, no production file imports the Paper `Surface`
 *     symbol. Mirrors the ESLint `no-restricted-imports` seed and
 *     ensures the rule is not silently weakened by carve-outs.
 *
 * Why duplicate ESLint coverage:
 *   - These walks fail fast in CI even if the lint job is skipped
 *     (translation-only PRs, etc.).
 *   - They make the contract explicit at the test layer, which is
 *     where the rest of the FOU-115 surface is asserted.
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
  describe('I_DS2: DS layer is observation-free (no mobx, no store imports)', () => {
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
          `DS file(s) violate I_DS2 (observation-free):\n${detail}`,
        );
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('I_DS3: Sheet / Modal / Dialog compose the Header building block', () => {
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

  describe("Scenario I': Paper `Surface` is not imported outside the wrap-Paper carve-outs", () => {
    // The ESLint rule excludes Switch/Checkbox/RadioButton — those are
    // the only DS files that may keep importing the Paper counterpart
    // (and only after Phase 4 inversion). They don't import Surface
    // anyway; the exclusion is a forward-compatibility carve-out. The
    // grep below is broader: NO Paper Surface import anywhere in
    // `src/`. If a future PR legitimately needs one, the carve-out
    // belongs both here and in the ESLint config.
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
