/**
 * Generate bench-config.json for the BenchmarkRunnerScreen.
 *
 * Reads the tier from BENCH_TIER (default: smoke), applies optional
 * BENCH_MODELS / BENCH_QUANTS / BENCH_BACKENDS filters, and writes the
 * screen's BenchConfig JSON shape.
 *
 *   BENCH_TIER=smoke|focused|full   default 'smoke'
 *   BENCH_MODELS=id1,id2            optional model-id filter (narrows tier)
 *   BENCH_QUANTS=q4_0,q6_k          optional quant filter (narrows tier)
 *   BENCH_BACKENDS=cpu,gpu          optional backend filter (default both)
 *
 *   --out <path>     output JSON path (default: e2e/debug-output/bench-config.json)
 *   --push [<udid>]  also `adb push` to the e2e flavor's external files dir
 *
 * Examples:
 *   yarn build:bench-config
 *   BENCH_TIER=focused yarn build:bench-config --push
 *   BENCH_TIER=full BENCH_MODELS=qwen3.5-2b yarn build:bench-config --out /tmp/c.json
 */

import * as fs from 'fs';
import * as path from 'path';
import {execFileSync} from 'child_process';

import {buildConfig as buildSharedConfig} from '../helpers/bench-runner';
import {getBenchmarkMatrix} from '../fixtures/benchmark-models';

const REMOTE_PACKAGE = 'com.pocketpalai.e2e';
const REMOTE_DIR = `/sdcard/Android/data/${REMOTE_PACKAGE}/files`;
const REMOTE_PATH = `${REMOTE_DIR}/bench-config.json`;
const DEFAULT_OUT = path.join(__dirname, '..', 'debug-output', 'bench-config.json');

interface Args {
  out: string;
  push: boolean;
  udid?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {out: DEFAULT_OUT, push: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      out.out = argv[++i];
    } else if (a === '--push') {
      out.push = true;
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out.udid = next;
        i++;
      }
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit();
    } else {
      console.error(`Unknown arg: ${a}`);
      printHelpAndExit(1);
    }
  }
  return out;
}

function printHelpAndExit(code = 0): never {
  console.log(`
Usage: yarn build:bench-config [--out <path>] [--push [<udid>]]

Reads tier + filters from env vars (BENCH_TIER, BENCH_MODELS, BENCH_QUANTS,
BENCH_BACKENDS) and emits the BenchmarkRunnerScreen's bench-config.json.

  --out <path>     output path (default: ${DEFAULT_OUT})
  --push [<udid>]  also adb-push to ${REMOTE_PATH}

Tiers:
  smoke    3 models × 3 quants  (~18 cells, ~10–15 min)        DEFAULT
  focused  6 models × 6 quants  (~60 cells, ~30–45 min)
  full    11 models × 8 quants  (~165 cells, ~3 hr)
`);
  process.exit(code);
}

// The CLI script delegates to the canonical builder in helpers/bench-runner.ts
// (single source of truth for the BenchConfig JSON shape) and re-attaches the
// CLI-only `tier` field. Previously, this script duplicated the models/quants
// derivation AND emitted a different `nr` (1 vs the helper's 3); see round-1
// review C2.
export function buildScreenConfig() {
  const matrix = getBenchmarkMatrix();
  return {tier: matrix.tier, ...buildSharedConfig(matrix)};
}

function summarize(cfg: ReturnType<typeof buildScreenConfig>) {
  const cellCount = cfg.models.reduce(
    (sum, m) => sum + m.quants.length * cfg.backends.length,
    0,
  );
  console.error(`tier=${cfg.tier}`);
  console.error(`models=${cfg.models.length}, backends=${cfg.backends.join('+')}, cells=${cellCount}`);
  for (const m of cfg.models) {
    console.error(`  ${m.id}: ${m.quants.length} quants`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = buildScreenConfig();

  if (cfg.models.length === 0) {
    console.error('Error: tier+filters produced an empty matrix.');
    process.exit(1);
  }

  summarize(cfg);

  fs.mkdirSync(path.dirname(args.out), {recursive: true});
  fs.writeFileSync(args.out, JSON.stringify(cfg, null, 2));
  console.error(`wrote ${args.out}`);

  if (args.push) {
    // argv-style invocation: udid and args.out land in their own slots so
    // shell metacharacters cannot inject commands (round-1 C5).
    const adbPrefix = args.udid ? ['-s', args.udid] : [];
    execFileSync('adb', [...adbPrefix, 'shell', 'mkdir', '-p', REMOTE_DIR], {
      stdio: 'inherit',
    });
    execFileSync('adb', [...adbPrefix, 'push', args.out, REMOTE_PATH], {
      stdio: 'inherit',
    });
    console.error(`pushed to ${REMOTE_PATH}${args.udid ? ` on ${args.udid}` : ''}`);
  }
}

if (require.main === module) {
  main();
}
