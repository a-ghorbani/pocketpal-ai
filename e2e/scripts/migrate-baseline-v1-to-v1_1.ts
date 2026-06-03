/**
 * One-shot migration: v1.0 -> v1.1 baseline schema (WHAT D8, 4f.2).
 *
 * Why this exists:
 *   - The v1.1 schema adds two row-identity fields per run row
 *     (settings_fingerprint, settings_overrides) and bumps the file's
 *     `version` from '1.0' to '1.1'.
 *   - merge-bench-reports.ts and benchmark-compare.ts now key on a
 *     4-tuple including the fingerprint. Legacy baselines without the
 *     fingerprint cannot be mixed with new v1.1 reports — the merger
 *     refuses with a hint pointing operators at this script.
 *
 * What it does:
 *   - Stamps every row with `settings_fingerprint: 'app-default'` and
 *     `settings_overrides: {}` (the only path that mints `app-default`
 *     retroactively — WHAT D7/D8).
 *   - Bumps `report.version` from '1.0' to '1.1'.
 *   - Idempotent: running twice produces the same output as running
 *     once. Already-v1.1 inputs pass through unchanged.
 *   - Throws on unknown versions so unsupported formats fail loud.
 *
 * Usage:
 *   npx ts-node scripts/migrate-baseline-v1-to-v1_1.ts \
 *     --input 'e2e/baselines/benchmark/*.json' --in-place
 *
 *   npx ts-node scripts/migrate-baseline-v1-to-v1_1.ts \
 *     --input 'old/*.json' --out-dir migrated/
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Tiny glob shim — matches `<dir>/<prefix>*<suffix>` of one segment.
 * Same shape as the merge script's helper; copy/paste avoids creating a
 * new shared module for two callers.
 */
function expandGlob(pattern: string): string[] {
  const star = pattern.lastIndexOf('*');
  if (star < 0) {
    return fs.existsSync(pattern) ? [pattern] : [];
  }
  const dir = path.dirname(pattern.slice(0, star) + 'x');
  const base = path.basename(pattern);
  const [prefix, suffix] = base.split('*');
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter(f => f.startsWith(prefix ?? '') && f.endsWith(suffix ?? ''))
    .map(f => path.join(dir, f));
}

interface Args {
  input: string;
  inPlace: boolean;
  outDir?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {input: '', inPlace: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') {
      out.input = argv[++i];
    } else if (a === '--in-place') {
      out.inPlace = true;
    } else if (a === '--out-dir') {
      out.outDir = argv[++i];
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit();
    } else {
      console.error(`Unknown arg: ${a}`);
      printHelpAndExit(1);
    }
  }
  if (!out.input) {
    console.error('--input is required');
    printHelpAndExit(1);
  }
  if (!out.inPlace && !out.outDir) {
    console.error('--in-place or --out-dir is required');
    printHelpAndExit(1);
  }
  return out;
}

function printHelpAndExit(code = 0): never {
  console.log(`
Usage: migrate-baseline-v1-to-v1_1.ts --input <glob> (--in-place | --out-dir <dir>)

Stamps every row in v1.0 baseline JSONs with:
  settings_fingerprint: "app-default"
  settings_overrides:   {}
and bumps the report's version from "1.0" to "1.1".

Idempotent — running twice produces the same output. Throws on
unknown versions.

  --input <glob>      glob of baseline files (one segment of '*'
                      supported, e.g. 'e2e/baselines/benchmark/*.json')
  --in-place          rewrite each input file in place
  --out-dir <dir>     write migrated copies to this directory
                      (preserves original filenames)
`);
  process.exit(code);
}

/**
 * Pure migration helper. Idempotent. Throws on unknown versions.
 *
 * Behaviour by input version:
 *   - '1.1' (already migrated): return unchanged.
 *   - '1.0' or missing (legacy): stamp every row, bump version.
 *   - anything else: throw.
 *
 * `settings_axes_used` is intentionally NOT added — the legacy
 * baselines were captured WITHOUT sweeps by construction, so adding
 * it would lie about provenance.
 */
export function migrateReport(report: any): any {
  const version = report.version ?? '1.0';
  if (version === '1.1') {
    return report;
  }
  if (version !== '1.0') {
    throw new Error(`unsupported version: ${version}`);
  }
  const runs = (report.runs ?? []).map((r: any) => ({
    ...r,
    settings_fingerprint: 'app-default',
    settings_overrides: {},
  }));
  return {
    ...report,
    version: '1.1',
    runs,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = expandGlob(args.input).sort();
  if (files.length === 0) {
    console.error(`No files matched: ${args.input}`);
    process.exit(1);
  }
  if (args.outDir) {
    fs.mkdirSync(args.outDir, {recursive: true});
  }
  console.error(`migrating ${files.length} file(s):`);
  let migratedCount = 0;
  let unchangedCount = 0;
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    const before = raw.version ?? '1.0';
    const out = migrateReport(raw);
    const target = args.outDir
      ? path.join(args.outDir, path.basename(f))
      : f;
    fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
    if (before === '1.1') {
      unchangedCount++;
      console.error(`  - ${path.relative(process.cwd(), f)} (already 1.1)`);
    } else {
      migratedCount++;
      console.error(`  - ${path.relative(process.cwd(), f)} (1.0 -> 1.1)`);
    }
  }
  console.error(
    `\ndone: ${migratedCount} migrated, ${unchangedCount} unchanged`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}
