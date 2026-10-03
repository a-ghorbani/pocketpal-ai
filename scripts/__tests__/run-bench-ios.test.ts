import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  DEEP_LINK,
  STALL_MS,
  buildPlan,
  evaluatePoll,
  isAppRunning,
  newestNewReport,
  parseFileList,
  run,
  type DriverDeps,
  type DriverOptions,
  type PollInput,
  type PollVerdict,
} from '../../e2e/scripts/run-bench-ios';
import {buildConfig, expectedCellCount} from '../../e2e/helpers/bench-runner';
import {getBenchmarkMatrix} from '../../e2e/fixtures/benchmark-models';

function recordingDeps(throwOn?: string) {
  const calls: string[][] = [];
  const deps: DriverDeps = {
    exec: (file, args) => {
      calls.push([file, ...args]);
      if (throwOn && args.join(' ').includes(throwOn)) {
        throw new Error('sentinel');
      }
      return '';
    },
    sleep: async () => undefined,
    now: () => 0,
    log: () => undefined,
  };
  return {calls, deps};
}

function options(over: Partial<DriverOptions> = {}): DriverOptions {
  return {
    device: 'DRYRUN',
    out: fs.mkdtempSync(path.join(os.tmpdir(), 'bench-ios-test-')),
    dryRun: true,
    settleMs: 15_000,
    startTimeoutMs: 120_000,
    pollMs: 30_000,
    maxWaitMs: 3_600_000,
    ...over,
  };
}

describe('buildPlan', () => {
  const base = {device: 'X', configPath: '/tmp/c.json', settleMs: 15_000};

  it('launches, settles, snapshots, pushes the config, then delivers the link warm', () => {
    const plan = buildPlan(base);
    expect(plan.map(s => s.kind)).toEqual([
      'launch',
      'settle',
      'snapshot',
      'push-config',
      'deep-link',
    ]);
    const deepLink = plan[4];
    expect(deepLink.kind === 'deep-link' && deepLink.argv).toEqual([
      'devicectl',
      'device',
      'process',
      'launch',
      '--device',
      'X',
      '--payload-url',
      DEEP_LINK,
      'ai.pocketpal',
    ]);
  });

  it('installs first only when an app bundle is given', () => {
    const plan = buildPlan({...base, appBundle: '/b/PocketPal.app'});
    expect(plan[0]).toEqual({
      kind: 'install',
      argv: [
        'devicectl',
        'device',
        'install',
        'app',
        '--device',
        'X',
        '/b/PocketPal.app',
      ],
    });
    expect(buildPlan(base).some(s => s.kind === 'install')).toBe(false);
  });
});

describe('run', () => {
  it('makes no device or unzip call on a dry run, with or without --app', async () => {
    for (const app of [undefined, 'build/PocketPal.ipa']) {
      const {calls, deps} = recordingDeps();
      const result = await run(options({app}), deps);
      expect(calls).toEqual([]);
      expect(result.state).toBe('dry-run');
      expect(fs.existsSync(result.configPath)).toBe(true);
    }
  });

  it('prints an install step naming the unzipped bundle only for --app', async () => {
    const {deps} = recordingDeps();
    const withApp = await run(options({app: 'build/PocketPal.ipa'}), deps);
    const withoutApp = await run(options(), deps);
    expect(withApp.plan[0]).toMatchObject({kind: 'install'});
    expect(
      withApp.plan[0].kind === 'install' && withApp.plan[0].argv,
    ).toContain('<unzipped>/Payload/*.app');
    expect(withoutApp.plan.some(s => s.kind === 'install')).toBe(false);
  });

  it('reports the same cell count as the shared helper', async () => {
    const {deps} = recordingDeps();
    const result = await run(options(), deps);
    expect(result.expected).toBe(
      expectedCellCount(buildConfig(getBenchmarkMatrix())),
    );
  });

  it.each([
    ['with --app', 'build/PocketPal.app', true],
    ['without --app', undefined, false],
  ])(
    'installs %s only, and as the first device mutation',
    async (_label, app, installs) => {
      const {calls, deps} = recordingDeps('process launch');
      await expect(run(options({app, dryRun: false}), deps)).rejects.toThrow(
        'sentinel',
      );
      const verbs = calls.map(c => c.slice(3, 5).join(' '));
      expect(verbs.includes('install app')).toBe(installs);
      expect(verbs[verbs.length - 1]).toBe('process launch');
      if (installs) {
        expect(verbs[0]).toBe('install app');
      }
    },
  );
});

describe('run against a simulated device', () => {
  const NAME = 'benchmark-report-2026-09-25T10-00-00-000Z.json';

  function simulatedDevice(report: object, alive: boolean) {
    let clock = 0;
    let linked = false;
    const deps: DriverDeps = {
      exec: (_file, args) => {
        const cmd = args.slice(2, 4).join(' ');
        if (args.includes('--payload-url')) {
          linked = true;
        }
        if (cmd === 'info files') {
          return linked ? `${NAME}   1234` : '';
        }
        if (cmd === 'copy from') {
          const dest = args[args.indexOf('--destination') + 1];
          fs.writeFileSync(dest, JSON.stringify(report));
        }
        if (cmd === 'info processes') {
          return alive ? '42 /x/PocketPal.app/PocketPal' : '';
        }
        return '';
      },
      sleep: async ms => {
        clock += ms;
      },
      now: () => clock,
      log: () => undefined,
    };
    return deps;
  }

  const fullRows = (n: number, status = 'ok') =>
    Array.from({length: n}, () => ({
      model_id: 'm',
      quant: 'q',
      requested_backend: 'gpu',
      status,
    }));

  it('finishes done and stamps the pulled report when outcome is complete', async () => {
    const opts = options({dryRun: false});
    const expected = expectedCellCount(buildConfig(getBenchmarkMatrix()));
    const result = await run(
      opts,
      simulatedDevice({runs: fullRows(expected), outcome: 'complete'}, true),
    );
    expect(result.state).toBe('done');
    const stamped = JSON.parse(
      fs.readFileSync(path.join(opts.out, NAME), 'utf8'),
    );
    expect(stamped.device).toBeDefined();
    expect(stamped.commit).toBeDefined();
  });

  it('fails app-exited, not done, when the app is gone with every row but no outcome', async () => {
    const opts = options({dryRun: false});
    const expected = expectedCellCount(buildConfig(getBenchmarkMatrix()));
    const result = await run(
      opts,
      simulatedDevice({runs: fullRows(expected)}, false),
    );
    expect(result).toMatchObject({state: 'failed', reason: 'app-exited'});
  });

  it('throws the pass gate when a completed matrix has a failed row', async () => {
    const expected = expectedCellCount(buildConfig(getBenchmarkMatrix()));
    await expect(
      run(
        options({dryRun: false}),
        simulatedDevice(
          {
            runs: [...fullRows(expected - 1), ...fullRows(1, 'failed')],
            outcome: 'complete',
          },
          true,
        ),
      ),
    ).rejects.toThrow(/cells failed/);
  });
});

describe('evaluatePoll', () => {
  const EXPECTED = 72;
  const input = (over: Partial<PollInput>): PollInput => ({
    report: null,
    expected: EXPECTED,
    processAlive: true,
    stableCompletePolls: 0,
    rowsSeen: 0,
    sinceNewRowMs: 60_000,
    elapsedMs: 60_000,
    startTimeoutMs: 120_000,
    maxWaitMs: 3_600_000,
    ...over,
  });
  const rows = (n: number) =>
    Array.from({length: n}, () => ({
      model_id: 'm',
      quant: 'q',
      requested_backend: 'gpu',
      status: 'ok',
    }));

  const cases: [
    string,
    Partial<PollInput>,
    PollVerdict | Partial<PollVerdict>,
  ][] = [
    ['no report yet, within start timeout', {}, {state: 'starting'}],
    [
      'no report at the start timeout',
      {elapsedMs: 120_000},
      {state: 'failed', reason: 'autostart'},
    ],
    [
      'shell seen',
      {report: {runs: []}},
      {state: 'running', rows: 0, stableCompletePolls: 0},
    ],
    [
      'outcome complete, all rows',
      {report: {runs: rows(72), outcome: 'complete'}},
      {state: 'done', markerMissing: false},
    ],
    [
      'outcome complete, 71 of 72 rows',
      {report: {runs: rows(71), outcome: 'complete'}},
      {state: 'failed', reason: 'count-mismatch'},
    ],
    [
      'outcome error',
      {report: {runs: rows(3), outcome: 'error:boom'}},
      {state: 'failed', reason: 'runner-error', detail: 'error:boom'},
    ],
    [
      'outcome complete wins over a gone process',
      {report: {runs: rows(72), outcome: 'complete'}, processAlive: false},
      {state: 'done', markerMissing: false},
    ],
    [
      'process gone, all rows, no outcome',
      {report: {runs: rows(72)}, processAlive: false},
      {state: 'failed', reason: 'app-exited'},
    ],
    [
      'all rows, no outcome, first sighting',
      {report: {runs: rows(72)}},
      {state: 'running', rows: 72, stableCompletePolls: 1},
    ],
    [
      'all rows, no outcome, two more polls',
      {report: {runs: rows(72)}, stableCompletePolls: 2},
      {state: 'done', markerMissing: true},
    ],
    [
      'rows still arriving at max wait',
      {report: {runs: rows(40)}, rowsSeen: 40, elapsedMs: 3_600_000},
      {
        state: 'failed',
        reason: 'timeout',
        stalled: false,
        detail:
          'max wait 60 min reached with 40/72 rows; last new row 1 min ago',
      },
    ],
    [
      'no new row for the stall window at max wait',
      {
        report: {runs: rows(40)},
        rowsSeen: 40,
        sinceNewRowMs: STALL_MS,
        elapsedMs: 3_600_000,
      },
      {state: 'failed', reason: 'timeout', stalled: true},
    ],
    [
      'past the stall window overall, but a recent row',
      {
        report: {runs: rows(10)},
        rowsSeen: 10,
        sinceNewRowMs: STALL_MS - 60_000,
        elapsedMs: STALL_MS + 5 * 60_000,
        maxWaitMs: STALL_MS + 5 * 60_000,
      },
      {state: 'failed', reason: 'timeout', stalled: false},
    ],
    [
      'max wait under the stall window with no row yet',
      {
        report: {runs: []},
        maxWaitMs: 600_000,
        elapsedMs: 600_000,
        sinceNewRowMs: 600_000,
      },
      {
        state: 'failed',
        reason: 'timeout',
        stalled: false,
        detail: expect.stringContaining('0/72 rows; no row yet'),
      },
    ],
    [
      'unparsable pull retries',
      {report: 'unparsable'},
      {state: 'running', rows: null, stableCompletePolls: 0},
    ],
    [
      'unparsable pull at max wait',
      {report: 'unparsable', elapsedMs: 3_600_000},
      {state: 'failed', reason: 'timeout'},
    ],
  ];

  it.each(cases)('%s', (_label, over, expected) => {
    expect(evaluatePoll(input(over))).toMatchObject(expected);
  });
});

describe('report discovery', () => {
  it('ignores reports in the snapshot and picks the newest new one', () => {
    const snapshot = new Set([
      'benchmark-report-2026-09-25T08-00-00-000Z.json',
    ]);
    expect(
      newestNewReport(
        [
          'benchmark-report-2026-09-25T08-00-00-000Z.json',
          'benchmark-report-2026-09-25T10-00-00-000Z.json',
          'benchmark-report-2026-09-25T09-00-00-000Z.json',
        ],
        snapshot,
      ),
    ).toBe('benchmark-report-2026-09-25T10-00-00-000Z.json');
    expect(newestNewReport([...snapshot], snapshot)).toBeUndefined();
  });

  it('reads report names from the first column of the file listing', () => {
    const listing = [
      'Files in Documents:',
      'bench-config.json                                     1234',
      'benchmark-report-2026-09-25T08-27-56-032Z.json       45678',
      'benchmark-report-2026-09-25T09-13-28-296Z.json       45999',
    ].join('\n');
    expect(parseFileList(listing)).toEqual([
      'benchmark-report-2026-09-25T08-27-56-032Z.json',
      'benchmark-report-2026-09-25T09-13-28-296Z.json',
    ]);
  });

  it('detects the app by its bundle executable path', () => {
    expect(
      isAppRunning(
        '1234  /private/var/containers/Bundle/Application/X/PocketPal.app/PocketPal',
      ),
    ).toBe(true);
    expect(isAppRunning('99  /usr/libexec/backboardd')).toBe(false);
  });
});

describe('devicectl text output as captured from a real device', () => {
  it('reads report names from a Documents listing with header, separator and nested paths', () => {
    const listing = [
      '5 files:',
      'Name                                                                 URL Resources        Size      Modification date',
      '------------------------------------------------------------------   ------------------   -------   -----------------',
      'bench-config.json                                                    Writable, Readable   2,1 KB    25.09.26, 10:26',
      'benchmark-report-2026-09-25T08-27-56-032Z.json                       Writable, Readable   45 KB     25.09.26, 10:27',
      'db-migration-complete.flag                                           Writable, Readable   4 bytes   25.09.26, 10:26',
      'models/hf/bartowski/Qwen_Qwen3-1.7B-GGUF/Qwen_Qwen3-1.7B-Q4_0.gguf   Writable, Readable              1,15 GB    25.09.26, 10:28',
      'benchmark-report-2026-09-25T09-13-28-296Z.json                       Writable, Readable   46 KB     25.09.26, 11:02',
    ].join('\n');
    expect(parseFileList(listing)).toEqual([
      'benchmark-report-2026-09-25T08-27-56-032Z.json',
      'benchmark-report-2026-09-25T09-13-28-296Z.json',
    ]);
  });

  it('returns no names for an empty Documents listing', () => {
    expect(parseFileList('0 files:\n')).toEqual([]);
  });

  it('finds PocketPal in a process listing and not other apps', () => {
    const listing = [
      'PID     Executable',
      '1       /sbin/launchd',
      '45280   /private/var/containers/Bundle/Application/0B7E6C2A-1D2F-4E53-9C1F-7A1B2C3D4E5F/PocketPal.app/PocketPal',
      '45301   /private/var/containers/Bundle/Application/AAAA/MobileSafari.app/MobileSafari',
    ].join('\n');
    expect(isAppRunning(listing)).toBe(true);
    expect(
      isAppRunning(
        listing
          .split('\n')
          .filter(l => !l.includes('PocketPal'))
          .join('\n'),
      ),
    ).toBe(false);
  });
});

describe('run against a scripted device', () => {
  const OLD = 'benchmark-report-2026-09-24T10-00-00-000Z.json';
  const NEW = 'benchmark-report-2026-09-25T10-00-00-000Z.json';
  const expected = expectedCellCount(buildConfig(getBenchmarkMatrix()));
  const okRows = (n: number) =>
    Array.from({length: n}, () => ({
      model_id: 'm',
      quant: 'q',
      requested_backend: 'gpu',
      status: 'ok',
    }));

  type Pull = object | 'garbage' | 'throw';
  const sequence = <T>(steps: T | T[]) => {
    const list = Array.isArray(steps) ? steps : [steps];
    let i = 0;
    return () => list[Math.min(i++, list.length - 1)];
  };

  function scriptedDevice(opts: {
    report?: object;
    pulls?: Pull[];
    preexisting?: string[];
    alive?: boolean | boolean[];
  }) {
    let clock = 0;
    let linked = false;
    const calls: string[][] = [];
    const logs: string[] = [];
    const nextPull = sequence<Pull | undefined>(opts.pulls ?? opts.report);
    const nextAlive = sequence(opts.alive ?? true);
    const deps: DriverDeps = {
      exec: (_file, args) => {
        calls.push(args);
        const cmd = args.slice(2, 4).join(' ');
        if (args.includes('--payload-url')) {
          linked = true;
        }
        if (cmd === 'info files') {
          const names = [...(opts.preexisting ?? [])];
          if (linked && (opts.report || opts.pulls)) {
            names.push(NEW);
          }
          return names
            .map(n => `${n}   Writable, Readable   45 KB   25.09.26, 10:27`)
            .join('\n');
        }
        if (cmd === 'copy from') {
          const dest = args[args.indexOf('--destination') + 1];
          const pull = nextPull();
          if (pull === 'throw') {
            throw new Error('device disconnected');
          }
          fs.writeFileSync(
            dest,
            pull === 'garbage' ? '{"runs": [' : JSON.stringify(pull),
          );
        }
        if (cmd === 'info processes') {
          return !nextAlive()
            ? ''
            : '45280   /private/var/containers/Bundle/Application/U/PocketPal.app/PocketPal';
        }
        if (cmd === 'info details') {
          const out = args[args.indexOf('--json-output') + 1];
          fs.writeFileSync(
            out,
            JSON.stringify({
              result: {
                deviceProperties: {name: 'agh', osVersionNumber: '26.7'},
                hardwareProperties: {marketingName: 'iPhone 13 Pro'},
              },
            }),
          );
        }
        return '';
      },
      sleep: async ms => {
        clock += ms;
      },
      now: () => clock,
      log: msg => {
        logs.push(msg);
      },
    };
    return {deps, calls, logs};
  }

  const readStamped = (out: string) =>
    JSON.parse(fs.readFileSync(path.join(out, NEW), 'utf8'));
  const copied = (calls: string[][]) =>
    calls
      .filter(a => a.slice(2, 4).join(' ') === 'copy from')
      .map(a => a[a.indexOf('--source') + 1]);

  let savedEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    savedEnv = {...process.env};
    delete process.env.E2E_DEVICE_NAME;
    delete process.env.E2E_PLATFORM_VERSION;
    delete process.env.E2E_DEVICE_SOC;
  });
  afterEach(() => {
    process.env = savedEnv;
  });

  it('stamps device and os_version from devicectl details on done', async () => {
    const opts = options({dryRun: false});
    const {deps} = scriptedDevice({
      report: {runs: okRows(expected), outcome: 'complete'},
    });
    await expect(run(opts, deps)).resolves.toMatchObject({state: 'done'});
    expect(readStamped(opts.out)).toMatchObject({
      device: 'iPhone 13 Pro',
      os_version: '26.7',
      soc: null,
    });
  });

  it('lets E2E_DEVICE_NAME, E2E_PLATFORM_VERSION and E2E_DEVICE_SOC override the stamp', async () => {
    process.env.E2E_DEVICE_NAME = 'Bench iPhone';
    process.env.E2E_PLATFORM_VERSION = '26.0';
    process.env.E2E_DEVICE_SOC = 'A15';
    const opts = options({dryRun: false});
    const {deps} = scriptedDevice({
      report: {runs: okRows(expected), outcome: 'complete'},
    });
    await run(opts, deps);
    expect(readStamped(opts.out)).toMatchObject({
      device: 'Bench iPhone',
      os_version: '26.0',
      soc: 'A15',
    });
  });

  it('fails autostart without pulling when only a stale report exists', async () => {
    const opts = options({dryRun: false});
    const {deps, calls} = scriptedDevice({preexisting: [OLD]});
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'failed',
      reason: 'autostart',
    });
    expect(copied(calls)).toEqual([]);
  });

  it('pulls only the new report when an older one sits in Documents', async () => {
    const opts = options({dryRun: false});
    const {deps, calls} = scriptedDevice({
      preexisting: [OLD],
      report: {runs: okRows(expected), outcome: 'complete'},
    });
    await expect(run(opts, deps)).resolves.toMatchObject({state: 'done'});
    expect(new Set(copied(calls))).toEqual(new Set([`Documents/${NEW}`]));
  });

  it('fails count-mismatch and stamps the report when complete is short a row', async () => {
    const opts = options({dryRun: false});
    const {deps} = scriptedDevice({
      report: {runs: okRows(expected - 1), outcome: 'complete'},
    });
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'failed',
      reason: 'count-mismatch',
    });
    expect(readStamped(opts.out).commit).toBeDefined();
  });

  it('fails runner-error on the first poll that sees an error outcome', async () => {
    const opts = options({dryRun: false});
    const {deps, calls} = scriptedDevice({
      report: {runs: okRows(2), outcome: 'error:enter-failed'},
    });
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'failed',
      reason: 'runner-error',
    });
    expect(copied(calls)).toHaveLength(1);
    expect(readStamped(opts.out).device).toBe('iPhone 13 Pro');
  });

  it('never writes to the device except the config, and never deletes', async () => {
    const opts = options({dryRun: false});
    const {deps, calls} = scriptedDevice({
      preexisting: [OLD],
      report: {runs: okRows(expected), outcome: 'complete'},
    });
    await run(opts, deps);
    const copyTo = calls.filter(a => a.slice(2, 4).join(' ') === 'copy to');
    expect(copyTo).toHaveLength(1);
    expect(copyTo[0][copyTo[0].indexOf('--destination') + 1]).toBe(
      'Documents/bench-config.json',
    );
    expect(
      calls.some(a => a.includes('delete') || a.includes('uninstall')),
    ).toBe(false);
  });

  it.each(['throw', 'garbage'] as const)(
    'stamps the last parsed report when the final pull fails (%s) and the app is gone',
    async mode => {
      const opts = options({dryRun: false});
      const {deps, logs} = scriptedDevice({
        pulls: [{runs: okRows(3)}, mode],
        alive: [true, false],
      });
      const result = await run(opts, deps);
      expect(result).toMatchObject({
        state: 'failed',
        reason: 'app-exited',
        reportPath: path.join(opts.out, NEW),
      });
      const stamped = readStamped(opts.out);
      expect(stamped.runs).toHaveLength(3);
      expect(stamped.device).toBe('iPhone 13 Pro');
      expect(logs.some(l => l.startsWith('pull failed (1 in a row)'))).toBe(
        true,
      );
    },
  );

  it('stamps the last parsed report on timeout and counts consecutive failed pulls', async () => {
    const opts = options({dryRun: false, maxWaitMs: 3 * 30_000});
    const {deps, logs} = scriptedDevice({
      pulls: [{runs: okRows(3)}, 'throw'],
    });
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'failed',
      reason: 'timeout',
    });
    expect(readStamped(opts.out)).toMatchObject({
      runs: okRows(3),
      device: 'iPhone 13 Pro',
    });
    expect(logs).toContain(
      'pull failed (2 in a row): copy failed: device disconnected',
    );
  });

  const failureLines = (logs: string[]) => ({
    detail: logs.find(l => l.startsWith('failed:timeout: ')) ?? '',
    hints: logs.filter(l => l.startsWith('hint: ')),
  });

  it('times out with the max-wait hint while rows are still arriving past the stall window', async () => {
    const pollMs = STALL_MS / 3;
    const opts = options({dryRun: false, pollMs, maxWaitMs: 5 * pollMs});
    const {deps, logs} = scriptedDevice({
      pulls: [1, 2, 3, 4, 5].map(n => ({runs: okRows(n)})),
    });
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'failed',
      reason: 'timeout',
    });
    const {detail, hints} = failureLines(logs);
    expect(detail).toContain(`5/${expected} rows; last new row 0 min ago`);
    expect(hints.some(h => h.includes('BENCH_MAX_WAIT_MIN'))).toBe(true);
    expect(hints.some(h => h.includes('locked'))).toBe(false);
  });

  it('times out blaming a lock when no new row arrives for the stall window', async () => {
    const opts = options({dryRun: false, maxWaitMs: STALL_MS + 2 * 30_000});
    const {deps, logs} = scriptedDevice({pulls: [{runs: okRows(2)}]});
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'failed',
      reason: 'timeout',
    });
    const {detail, hints} = failureLines(logs);
    expect(detail).toContain(`2/${expected} rows; last new row 16 min ago`);
    expect(hints.some(h => h.includes('locked'))).toBe(true);
  });

  it('keeps the stall clock running through unparsable pulls', async () => {
    const opts = options({dryRun: false, maxWaitMs: STALL_MS + 2 * 30_000});
    const {deps, logs} = scriptedDevice({
      pulls: [{runs: okRows(2)}, 'garbage'],
    });
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'failed',
      reason: 'timeout',
    });
    const {detail, hints} = failureLines(logs);
    expect(detail).toContain(`2/${expected} rows; last new row 16 min ago`);
    expect(hints.some(h => h.includes('locked'))).toBe(true);
    expect(readStamped(opts.out).runs).toHaveLength(2);
  });

  it('resets the failed-pull count after a good pull', async () => {
    const opts = options({dryRun: false});
    const {deps, logs} = scriptedDevice({
      pulls: [{runs: okRows(1)}, 'throw', {runs: okRows(2)}, 'throw'],
      alive: [true, true, true, false],
    });
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'failed',
      reason: 'app-exited',
    });
    const pullFailures = logs.filter(l => l.startsWith('pull failed'));
    expect(pullFailures).toHaveLength(2);
    expect(
      pullFailures.every(l => l.startsWith('pull failed (1 in a row)')),
    ).toBe(true);
    expect(readStamped(opts.out).runs).toHaveLength(2);
  });

  it('stamps nothing and reports no path when no pull ever parses', async () => {
    const opts = options({dryRun: false});
    const {deps, logs, calls} = scriptedDevice({
      pulls: ['garbage'],
      alive: [true, false],
    });
    const result = await run(opts, deps);
    expect(result).toMatchObject({state: 'failed', reason: 'app-exited'});
    expect(result.reportPath).toBeUndefined();
    expect(logs).toContain('no parsed report; nothing stamped');
    expect(logs.some(l => l.startsWith('report: '))).toBe(false);
    expect(calls.some(a => a.slice(2, 4).join(' ') === 'info details')).toBe(
      false,
    );
  });

  it('completes by row count only on consecutive parsed pulls, never across an unparsable one', async () => {
    const opts = options({dryRun: false});
    const full = {runs: okRows(expected)};
    const {deps, logs, calls} = scriptedDevice({
      pulls: [full, full, 'garbage', full],
    });
    await expect(run(opts, deps)).resolves.toMatchObject({
      state: 'done',
      reportPath: path.join(opts.out, NEW),
    });
    expect(copied(calls)).toHaveLength(6);
    expect(logs).toContain(
      'warning: report has no outcome marker; completed by row count',
    );
    expect(readStamped(opts.out)).toMatchObject({device: 'iPhone 13 Pro'});
  });
});
