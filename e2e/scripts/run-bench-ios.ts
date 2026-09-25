/**
 * Run the benchmark matrix on a connected iPhone through `xcrun devicectl`.
 *
 *   yarn bench:ios --device <udid> [--app <PocketPal.ipa|PocketPal.app>]
 *                  [--out <dir>] [--dry-run]
 *
 * Reads the same BENCH_* env as `yarn build:bench-config`. The installed app
 * must be an E2E build (`yarn ios:build:ipa`); the benchmark route does not
 * exist in production builds.
 *
 * `--app` installs over `ai.pocketpal`, which replaces an App Store copy and
 * wipes its data. Without `--app` the driver uses whatever is installed.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {execFileSync} from 'child_process';

import {getBenchmarkMatrix} from '../fixtures/benchmark-models';
import {
  assertRowsPass,
  buildConfig,
  expectedCellCount,
  stampReportMetadata,
  type BenchReportFile,
} from '../helpers/bench-runner';

export const BUNDLE_ID = 'ai.pocketpal';
export const DEEP_LINK = 'pocketpal://e2e/benchmark?autostart=1';
const APP_CONTAINER = [
  '--domain-type',
  'appDataContainer',
  '--domain-identifier',
  BUNDLE_ID,
];
const DEVICE_CONFIG_PATH = 'Documents/bench-config.json';
const APP_PROCESS_PATH = 'PocketPal.app/PocketPal';
const UNZIPPED_APP_PLACEHOLDER = '<unzipped>/Payload/*.app';
const STABLE_COMPLETE_POLLS = 2;
const DEFAULT_OUT = path.join(__dirname, '..', 'debug-output', 'benchmarks');

export interface DriverOptions {
  device: string;
  app?: string;
  out: string;
  dryRun: boolean;
  settleMs: number;
  startTimeoutMs: number;
  pollMs: number;
  maxWaitMs: number;
}

export interface DriverDeps {
  exec: (file: string, args: string[]) => string;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (msg: string) => void;
}

const defaultDeps: DriverDeps = {
  exec: (file, args) =>
    execFileSync(file, args, {encoding: 'utf8', timeout: 600_000}),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => Date.now(),
  log: msg => console.error(msg),
};

export type PlanStep =
  | {
      kind: 'install' | 'launch' | 'snapshot' | 'push-config' | 'deep-link';
      argv: string[];
    }
  | {kind: 'settle'; ms: number};

const devicectl = (
  udid: string,
  group: string,
  verb: string,
  ...rest: string[]
) => ['devicectl', 'device', group, verb, '--device', udid, ...rest];

export const listReportsArgv = (udid: string) =>
  devicectl(
    udid,
    'info',
    'files',
    ...APP_CONTAINER,
    '--subdirectory',
    'Documents',
  );

export const copyReportArgv = (udid: string, name: string, dest: string) =>
  devicectl(
    udid,
    'copy',
    'from',
    ...APP_CONTAINER,
    '--source',
    `Documents/${name}`,
    '--destination',
    dest,
  );

export const listProcessesArgv = (udid: string) =>
  devicectl(udid, 'info', 'processes');

export function buildPlan(opts: {
  device: string;
  appBundle?: string;
  configPath: string;
  settleMs: number;
}): PlanStep[] {
  const {device, appBundle, configPath, settleMs} = opts;
  const steps: PlanStep[] = [];
  if (appBundle) {
    steps.push({
      kind: 'install',
      argv: devicectl(device, 'install', 'app', appBundle),
    });
  }
  steps.push(
    {
      kind: 'launch',
      argv: devicectl(
        device,
        'process',
        'launch',
        '--terminate-existing',
        BUNDLE_ID,
      ),
    },
    {kind: 'settle', ms: settleMs},
    {kind: 'snapshot', argv: listReportsArgv(device)},
    {
      kind: 'push-config',
      argv: devicectl(
        device,
        'copy',
        'to',
        ...APP_CONTAINER,
        '--source',
        configPath,
        '--destination',
        DEVICE_CONFIG_PATH,
      ),
    },
    {
      kind: 'deep-link',
      argv: devicectl(
        device,
        'process',
        'launch',
        '--payload-url',
        DEEP_LINK,
        BUNDLE_ID,
      ),
    },
  );
  return steps;
}

export function describeStep(step: PlanStep): string {
  return step.kind === 'settle'
    ? `settle ${step.ms / 1000}s`
    : `xcrun ${step.argv.join(' ')}`;
}

export function parseFileList(text: string): string[] {
  return text
    .split('\n')
    .filter(line => line.includes('benchmark-report-'))
    .map(line => path.basename(line.trim().split(/\s+/)[0]))
    .filter(name => /^benchmark-report-.*\.json$/.test(name));
}

export function isAppRunning(text: string): boolean {
  return text.includes(APP_PROCESS_PATH);
}

export function newestNewReport(
  names: string[],
  snapshot: Set<string>,
): string | undefined {
  return names
    .filter(n => !snapshot.has(n))
    .sort()
    .pop();
}

export type FailureReason =
  | 'autostart'
  | 'count-mismatch'
  | 'runner-error'
  | 'app-exited'
  | 'timeout';

export type PollVerdict =
  | {state: 'starting'}
  | {state: 'running'; rows: number | null; stableCompletePolls: number}
  | {state: 'done'; markerMissing: boolean}
  | {state: 'failed'; reason: FailureReason; detail: string};

export interface PollInput {
  /** `null`: no new report yet. `'unparsable'`: pulled mid-rewrite. */
  report: BenchReportFile | 'unparsable' | null;
  expected: number;
  processAlive: boolean;
  stableCompletePolls: number;
  elapsedMs: number;
  startTimeoutMs: number;
  maxWaitMs: number;
}

export function evaluatePoll(input: PollInput): PollVerdict {
  const {report, expected, elapsedMs} = input;

  if (report === null) {
    if (elapsedMs >= input.startTimeoutMs) {
      return {
        state: 'failed',
        reason: 'autostart',
        detail: `no new benchmark report within ${input.startTimeoutMs / 1000}s`,
      };
    }
    if (elapsedMs >= input.maxWaitMs) {
      return timedOut(input);
    }
    return {state: 'starting'};
  }

  const rows = report === 'unparsable' ? null : report.runs.length;
  const outcome = report === 'unparsable' ? undefined : report.outcome;

  if (outcome === 'complete') {
    return rows === expected
      ? {state: 'done', markerMissing: false}
      : {
          state: 'failed',
          reason: 'count-mismatch',
          detail: `expected ${expected} rows, report has ${rows}`,
        };
  }
  if (outcome?.startsWith('error:')) {
    return {state: 'failed', reason: 'runner-error', detail: outcome};
  }
  if (!input.processAlive) {
    return {
      state: 'failed',
      reason: 'app-exited',
      detail: `app exited with ${rows ?? '?'}/${expected} rows and no outcome`,
    };
  }
  const stableCompletePolls =
    rows === expected ? input.stableCompletePolls + 1 : 0;
  if (stableCompletePolls > STABLE_COMPLETE_POLLS) {
    return {state: 'done', markerMissing: true};
  }
  if (elapsedMs >= input.maxWaitMs) {
    return timedOut(input);
  }
  return {state: 'running', rows, stableCompletePolls};
}

function timedOut(input: PollInput): PollVerdict {
  return {
    state: 'failed',
    reason: 'timeout',
    detail: `no terminal outcome within ${input.maxWaitMs / 60_000} min`,
  };
}

const FAILURE_HINTS: Record<FailureReason, string> = {
  autostart:
    'the deep link never started the matrix. Check that the installed app is an E2E build (yarn ios:build:ipa), that bench-config.json reached Documents, and that the app was running when the link arrived.',
  'count-mismatch': 'a row write was lost; inspect the report.',
  'runner-error': 'the runner aborted; the outcome names the error.',
  'app-exited': 'the app died mid-matrix (OOM or thermal).',
  timeout:
    'rows stopped arriving. The device was probably locked or the app backgrounded.',
};

export interface DriverResult {
  state: 'dry-run' | 'done' | 'failed';
  expected: number;
  configPath: string;
  plan: PlanStep[];
  reason?: FailureReason;
  reportPath?: string;
}

function resolveAppBundle(
  app: string | undefined,
  dryRun: boolean,
  deps: DriverDeps,
): string | undefined {
  if (!app || !app.endsWith('.ipa')) {
    return app;
  }
  if (dryRun) {
    return UNZIPPED_APP_PLACEHOLDER;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketpal-ipa-'));
  deps.exec('unzip', ['-q', '-o', app, '-d', dir]);
  const payload = path.join(dir, 'Payload');
  const bundle = fs.readdirSync(payload).find(f => f.endsWith('.app'));
  if (!bundle) {
    throw new Error(`no .app inside ${app}`);
  }
  return path.join(payload, bundle);
}

function readDeviceDetails(
  device: string,
  deps: DriverDeps,
): {device: string; osVersion: string} {
  let name = 'unknown';
  let osVersion = 'unknown';
  const jsonPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'pocketpal-devicectl-')),
    'details.json',
  );
  try {
    deps.exec(
      'xcrun',
      devicectl(device, 'info', 'details', '--json-output', jsonPath),
    );
    const result = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).result ?? {};
    name =
      result.hardwareProperties?.marketingName ??
      result.deviceProperties?.name ??
      name;
    osVersion = result.deviceProperties?.osVersionNumber ?? osVersion;
  } catch (e) {
    deps.log(`device details unavailable: ${(e as Error).message}`);
  }
  return {
    device: process.env.E2E_DEVICE_NAME || name,
    osVersion: process.env.E2E_PLATFORM_VERSION || osVersion,
  };
}

type ParsedReport = {file: string; report: BenchReportFile};
type PulledReport =
  | ParsedReport
  | {file: string; report: 'unparsable'; error: string};

function pullReport(
  opts: DriverOptions,
  name: string,
  deps: DriverDeps,
): PulledReport {
  const file = path.join(opts.out, name);
  try {
    deps.exec('xcrun', copyReportArgv(opts.device, name, file));
  } catch (e) {
    return {
      file,
      report: 'unparsable',
      error: `copy failed: ${(e as Error).message}`,
    };
  }
  try {
    return {file, report: JSON.parse(fs.readFileSync(file, 'utf8'))};
  } catch (e) {
    return {
      file,
      report: 'unparsable',
      error: `not valid JSON: ${(e as Error).message}`,
    };
  }
}

function appAlive(device: string, deps: DriverDeps): boolean {
  try {
    return isAppRunning(deps.exec('xcrun', listProcessesArgv(device)));
  } catch {
    return true;
  }
}

export async function run(
  opts: DriverOptions,
  deps: DriverDeps = defaultDeps,
): Promise<DriverResult> {
  const cfg = buildConfig(getBenchmarkMatrix());
  const expected = expectedCellCount(cfg);
  if (expected === 0) {
    throw new Error('BENCH_* filters excluded every cell.');
  }
  fs.mkdirSync(opts.out, {recursive: true});
  const configPath = path.join(opts.out, 'bench-config.json');
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  deps.log(`config: ${configPath}`);
  deps.log(`expectedCells=${expected}`);

  const plan = buildPlan({
    device: opts.device,
    appBundle: resolveAppBundle(opts.app, opts.dryRun, deps),
    configPath,
    settleMs: opts.settleMs,
  });

  if (opts.dryRun) {
    deps.log('plan (dry run, no device calls):');
    plan.forEach((step, i) => deps.log(`  ${i + 1}. ${describeStep(step)}`));
    return {state: 'dry-run', expected, configPath, plan};
  }

  let snapshot = new Set<string>();
  for (const step of plan) {
    deps.log(describeStep(step));
    if (step.kind === 'settle') {
      await deps.sleep(step.ms);
    } else if (step.kind === 'snapshot') {
      snapshot = new Set(parseFileList(deps.exec('xcrun', step.argv)));
    } else {
      deps.exec('xcrun', step.argv);
    }
  }

  const start = deps.now();
  let stableCompletePolls = 0;
  let lastRows: number | null = null;
  let reportName: string | undefined;
  let lastGood: ParsedReport | null = null;
  let failedPulls = 0;
  deps.log('waiting for report shell');

  for (;;) {
    await deps.sleep(opts.pollMs);
    if (!reportName) {
      try {
        reportName = newestNewReport(
          parseFileList(deps.exec('xcrun', listReportsArgv(opts.device))),
          snapshot,
        );
      } catch (e) {
        deps.log(`listing reports failed: ${(e as Error).message}`);
      }
    }
    const pulled = reportName ? pullReport(opts, reportName, deps) : null;
    const current = pulled?.report === 'unparsable' ? null : pulled;
    if (pulled?.report === 'unparsable') {
      failedPulls++;
      deps.log(`pull failed (${failedPulls} in a row): ${pulled.error}`);
    } else if (current) {
      failedPulls = 0;
      lastGood = current;
    }
    const verdict = evaluatePoll({
      report: pulled?.report ?? null,
      expected,
      processAlive: pulled ? appAlive(opts.device, deps) : true,
      stableCompletePolls,
      elapsedMs: deps.now() - start,
      startTimeoutMs: opts.startTimeoutMs,
      maxWaitMs: opts.maxWaitMs,
    });

    if (verdict.state === 'starting') {
      continue;
    }
    if (verdict.state === 'running') {
      stableCompletePolls = verdict.stableCompletePolls;
      if (verdict.rows !== null && verdict.rows !== lastRows) {
        lastRows = verdict.rows;
        deps.log(`rows=${verdict.rows}/${expected}`);
      }
      continue;
    }

    if (lastGood) {
      stampReportMetadata(
        lastGood.report,
        readDeviceDetails(opts.device, deps),
      );
      fs.writeFileSync(lastGood.file, JSON.stringify(lastGood.report, null, 2));
      deps.log(
        `report: ${lastGood.file} (${lastGood.report.runs.length} rows)`,
      );
    } else {
      deps.log('no parsed report; nothing stamped');
    }

    if (verdict.state === 'done') {
      if (verdict.markerMissing) {
        deps.log(
          'warning: report has no outcome marker; completed by row count',
        );
      }
      if (!current) {
        throw new Error('completed without a parsed report');
      }
      assertRowsPass(current.report);
      deps.log('pass gate: all rows ok');
      return {
        state: 'done',
        expected,
        configPath,
        plan,
        reportPath: current.file,
      };
    }

    deps.log(`failed:${verdict.reason}: ${verdict.detail}`);
    deps.log(`hint: ${FAILURE_HINTS[verdict.reason]}`);
    return {
      state: 'failed',
      expected,
      configPath,
      plan,
      reason: verdict.reason,
      reportPath: lastGood?.file,
    };
  }
}

const envNumber = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

function printHelpAndExit(code = 0): never {
  console.log(`
Usage: yarn bench:ios --device <udid> [--app <.ipa|.app>] [--out <dir>] [--dry-run]

  --device <udid>  target iPhone (or E2E_DEVICE_UDID); list with
                   \`xcrun devicectl list devices\`
  --app <path>     install this build first. Replaces any App Store
                   PocketPal (same bundle id ${BUNDLE_ID}) and wipes its data.
                   Omit to use the installed E2E build.
  --out <dir>      where the config and report land (default ${DEFAULT_OUT})
  --dry-run        write the config, print the cell count and the devicectl
                   plan, and contact no device

Env: the BENCH_* matrix variables of yarn build:bench-config, plus
  BENCH_MAX_WAIT_MIN         whole-run limit (default 60)
  BENCH_IOS_SETTLE_S         wait after launch before the deep link (default 15)
  BENCH_IOS_START_TIMEOUT_S  wait for the report shell (default 120)
  E2E_DEVICE_NAME, E2E_PLATFORM_VERSION, E2E_DEVICE_SOC  report metadata
`);
  process.exit(code);
}

export function parseArgs(argv: string[]): DriverOptions {
  const opts: DriverOptions = {
    device: process.env.E2E_DEVICE_UDID ?? '',
    out: DEFAULT_OUT,
    dryRun: false,
    settleMs: envNumber('BENCH_IOS_SETTLE_S', 15) * 1000,
    startTimeoutMs: envNumber('BENCH_IOS_START_TIMEOUT_S', 120) * 1000,
    pollMs: 30_000,
    maxWaitMs: envNumber('BENCH_MAX_WAIT_MIN', 60) * 60_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--device') {
      opts.device = argv[++i];
    } else if (a === '--app') {
      opts.app = argv[++i];
    } else if (a === '--out') {
      opts.out = path.resolve(argv[++i]);
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit();
    } else {
      console.error(`Unknown arg: ${a}`);
      printHelpAndExit(1);
    }
  }
  if (!opts.device) {
    console.error('Missing --device <udid> (or E2E_DEVICE_UDID).');
    printHelpAndExit(1);
  }
  return opts;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2)))
    .then(result => process.exit(result.state === 'failed' ? 1 : 0))
    .catch(e => {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    });
}
