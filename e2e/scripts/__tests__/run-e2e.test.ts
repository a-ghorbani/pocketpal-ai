#!/usr/bin/env npx tsx

/**
 * Tests for how the E2E runner reads JUnit reports. Uses Node's built-in test
 * runner (no jest in e2e), so it runs standalone via tsx:
 *
 *   npx tsx scripts/__tests__/run-e2e.test.ts
 *
 * A run in which every test self-skipped (e.g. a crash guard or an unreachable
 * backend) must not be reported as a pass.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

import {
  classifyCleanRun,
  parseJunitSuites,
  readRunJunitCounts,
} from '../run-e2e';

interface SuiteCounts {
  tests: number;
  skipped: number;
  failures?: number;
}

function suite({tests, skipped, failures = 0}: SuiteCounts) {
  const cases = Array.from({length: tests}, (_, i) => {
    const outcome =
      i < skipped ? '<skipped/>' : i < skipped + failures ? '<failure/>' : '';
    return `    <testcase classname="spec" name="case ${i}" time="0">${outcome}</testcase>`;
  });
  return `  <testsuite name="spec" time="0" tests="${tests}" failures="${failures}" errors="0" skipped="${skipped}">
    <properties>
      <property name="suiteName" value="spec"/>
    </properties>
${cases.join('\n')}
  </testsuite>`;
}

function report(...suites: SuiteCounts[]) {
  const total = (key: 'tests' | 'skipped' | 'failures') =>
    suites.reduce((sum, s) => sum + (s[key] ?? 0), 0);
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${total('tests')}" failures="${total(
    'failures',
  )}" errors="0" skipped="${total('skipped')}">
${suites.map(suite).join('\n')}
</testsuites>`;
}

const WDIO_MULTI_SUITE_REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="7" failures="6" errors="0" skipped="0">
  <testsuite name="Settings flow" timestamp="2026-01-01T00:00:00" time="180.5" tests="0" failures="0" errors="0" skipped="0">
    <properties>
      <property name="specId" value="0"/>
      <property name="suiteName" value="Settings flow"/>
    </properties>
  </testsuite>
  <testsuite name="first run" timestamp="2026-01-01T00:00:00" time="40.1" tests="2" failures="1" errors="0" skipped="0">
    <properties>
      <property name="specId" value="0"/>
      <property name="suiteName" value="first run"/>
    </properties>
    <testcase classname="android.Settings_flow.first_run" name="opens settings" time="16.2">
      <failure/>
    </testcase>
    <testcase classname="android.Settings_flow.first_run" name="keeps settings after restart" time="2.9"/>
  </testsuite>
  <testsuite name="from a fresh install" timestamp="2026-01-01T00:00:40" time="140.4" tests="5" failures="5" errors="0" skipped="0">
    <properties>
      <property name="specId" value="0"/>
      <property name="suiteName" value="from a fresh install"/>
    </properties>
    <testcase classname="android.Settings_flow.from_a_fresh_install" name="case 1" time="28.4"><failure/></testcase>
    <testcase classname="android.Settings_flow.from_a_fresh_install" name="case 2" time="28.3"><failure/></testcase>
    <testcase classname="android.Settings_flow.from_a_fresh_install" name="case 3" time="33.3"><failure/></testcase>
    <testcase classname="android.Settings_flow.from_a_fresh_install" name="case 4" time="31.7"><failure/></testcase>
    <testcase classname="android.Settings_flow.from_a_fresh_install" name="case 5" time="28.5"><failure/></testcase>
  </testsuite>
</testsuites>`;

test('parseJunitSuites sums counts across suites', () => {
  const {suites, counts} = parseJunitSuites(
    report({tests: 2, skipped: 1}, {tests: 3, skipped: 0, failures: 1}),
  );
  assert.equal(suites.length, 2);
  assert.deepEqual(counts, {tests: 5, failures: 1, errors: 0, skipped: 1});
});

test('parseJunitSuites returns zeros for a report without suites', () => {
  const {suites, counts} = parseJunitSuites(report());
  assert.equal(suites.length, 0);
  assert.deepEqual(counts, {tests: 0, failures: 0, errors: 0, skipped: 0});
});

test('a run where every test skipped is skipped, not passed', () => {
  const {counts} = parseJunitSuites(report({tests: 5, skipped: 5}));
  assert.equal(classifyCleanRun(counts), 'skipped');
});

test('a run where every test skipped across suites is skipped', () => {
  const {counts} = parseJunitSuites(
    report({tests: 1, skipped: 1}, {tests: 1, skipped: 1}),
  );
  assert.equal(classifyCleanRun(counts), 'skipped');
});

test('a run with at least one executed test is passed', () => {
  const {counts} = parseJunitSuites(report({tests: 2, skipped: 1}));
  assert.equal(classifyCleanRun(counts), 'passed');
});

test('a run without a JUnit report keeps its exit-code status', () => {
  assert.equal(classifyCleanRun(null), 'passed');
});

test('parseJunitSuites counts a wdio report as its root totals', () => {
  const {suites, counts} = parseJunitSuites(WDIO_MULTI_SUITE_REPORT);
  assert.equal(suites.length, 3);
  assert.deepEqual(counts, {tests: 7, failures: 6, errors: 0, skipped: 0});
  assert.equal(classifyCleanRun(counts), 'passed');
});

test('a run where every test skipped over nested suites keeps true counts', () => {
  const {counts} = parseJunitSuites(
    report(
      {tests: 0, skipped: 0},
      {tests: 2, skipped: 2},
      {tests: 3, skipped: 3},
    ),
  );
  assert.deepEqual(counts, {tests: 5, failures: 0, errors: 0, skipped: 5});
  assert.equal(classifyCleanRun(counts), 'skipped');
});

test('a run with one executed test over nested suites is passed', () => {
  const {counts} = parseJunitSuites(
    report(
      {tests: 0, skipped: 0},
      {tests: 2, skipped: 2},
      {tests: 3, skipped: 2},
    ),
  );
  assert.deepEqual(counts, {tests: 5, failures: 0, errors: 0, skipped: 4});
  assert.equal(classifyCleanRun(counts), 'passed');
});

test('a run with an empty report is passed', () => {
  const {counts} = parseJunitSuites(
    '<testsuites tests="0" failures="0" errors="0" skipped="0"/>',
  );
  assert.equal(classifyCleanRun(counts), 'passed');
});

test('a run ignores a merged junit-results.xml left in its report dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-e2e-test-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'junit-results.xml'),
      report({tests: 3, skipped: 0}),
    );
    fs.writeFileSync(
      path.join(dir, 'junit-model.xml'),
      report({tests: 2, skipped: 2}),
    );
    const counts = readRunJunitCounts(dir);
    assert.deepEqual(counts, {tests: 2, failures: 0, errors: 0, skipped: 2});
    assert.equal(classifyCleanRun(counts), 'skipped');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

// The runner is driven as a CLI with only `npx wdio` stubbed. The stub writes
// where wdio would: JUnit to DEVICEFARM_LOG_DIR (the junit reporter's
// outputDir) and a screenshot to DEVICEFARM_SCREENSHOT_PATH.
const E2E_DIR = path.join(__dirname, '..', '..');
const REPORTS_DIR = path.join(E2E_DIR, 'reports');
const TS_NODE = path.join(E2E_DIR, 'node_modules', '.bin', 'ts-node');

const WDIO_STUB = `#!/bin/sh
if [ "$1" != "wdio" ]; then
  echo "unexpected npx call: $*" >&2
  exit 127
fi
printf '%s\\t%s\\n' "$DEVICEFARM_LOG_DIR" "$DEVICEFARM_SCREENSHOT_PATH" >> "$STUB_WDIO_RECORD"
mkdir -p "$DEVICEFARM_LOG_DIR" "$DEVICEFARM_SCREENSHOT_PATH"
model=$(printf '%s' "\${TEST_MODELS:-unknown}" | sed 's/[^a-zA-Z0-9.-]/-/g')
cat > "$DEVICEFARM_LOG_DIR/junit-$model.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="1" failures="0" errors="0" skipped="0">
  <testsuite name="Quick Smoke" tests="1" failures="0" errors="0" skipped="0">
    <testcase classname="Quick Smoke" name="replies" time="1"/>
  </testsuite>
</testsuites>
XML
: > "$DEVICEFARM_SCREENSHOT_PATH/$model.png"
`;

interface WdioCall {
  logDir: string;
  screenshotDir: string;
}

function runRunner(args: string[], env: Record<string, string | undefined>) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-e2e-cli-'));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(binDir, 'npx'), WDIO_STUB, {mode: 0o755});
  const record = path.join(tmp, 'wdio-calls.tsv');

  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('DEVICEFARM_')) {
      childEnv[key] = value;
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }
  childEnv.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ''}`;
  childEnv.STUB_WDIO_RECORD = record;

  const result = spawnSync(TS_NODE, ['scripts/run-e2e.ts', ...args], {
    cwd: E2E_DIR,
    env: childEnv,
    encoding: 'utf8',
    timeout: 240000,
  });
  const calls: WdioCall[] = fs.existsSync(record)
    ? fs
        .readFileSync(record, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [logDir, screenshotDir] = line.split('\t');
          return {logDir, screenshotDir};
        })
    : [];
  return {tmp, result, calls};
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name));
}

function isInside(file: string, dir: string): boolean {
  const rel = path.relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function reportDirEntries(): Set<string> {
  return new Set(fs.existsSync(REPORTS_DIR) ? fs.readdirSync(REPORTS_DIR) : []);
}

test(
  'device-farm mode writes each run under Device Farm DEVICEFARM_LOG_DIR',
  {timeout: 300000},
  () => {
    const before = reportDirEntries();
    const dfRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-e2e-df-'));
    const dfLog = path.join(dfRoot, 'log');
    const dfShots = path.join(dfRoot, 'screenshots');
    fs.mkdirSync(dfLog);
    fs.mkdirSync(dfShots);
    let tmp = '';
    try {
      // The default testspecs' test command.
      const run = runRunner(
        ['--platform', 'android', '--each-model', '--mode', 'device-farm'],
        {DEVICEFARM_LOG_DIR: dfLog, DEVICEFARM_SCREENSHOT_PATH: dfShots},
      );
      tmp = run.tmp;
      assert.equal(
        run.result.status,
        0,
        run.result.stderr || run.result.stdout,
      );
      assert.ok(run.calls.length > 1, 'expected one wdio run per model');

      for (const call of run.calls) {
        assert.ok(
          isInside(call.logDir, dfLog),
          `wdio got DEVICEFARM_LOG_DIR=${call.logDir}, outside ${dfLog}`,
        );
        assert.ok(
          isInside(call.screenshotDir, dfLog) ||
            isInside(call.screenshotDir, dfShots) ||
            call.screenshotDir === dfShots,
          `wdio got DEVICEFARM_SCREENSHOT_PATH=${call.screenshotDir}, outside Device Farm's artifact dirs`,
        );
      }
      // readRunJunitCounts reads one run's dir, so runs must not share one.
      const runDirs = new Set(run.calls.map(call => call.logDir));
      assert.equal(runDirs.size, run.calls.length);

      const delivered = listFiles(dfLog).concat(listFiles(dfShots));
      const junit = delivered.filter(f => /junit-.+\.xml$/.test(f));
      assert.ok(
        junit.length >= run.calls.length,
        `expected per-run JUnit under ${dfLog}, found ${junit.length}`,
      );
      // post_test prints $DEVICEFARM_LOG_DIR/junit-results.xml.
      assert.ok(fs.existsSync(path.join(dfLog, 'junit-results.xml')));
      assert.equal(
        delivered.filter(f => f.endsWith('.png')).length,
        run.calls.length,
      );
    } finally {
      for (const entry of reportDirEntries()) {
        if (!before.has(entry)) {
          fs.rmSync(path.join(REPORTS_DIR, entry), {
            recursive: true,
            force: true,
          });
        }
      }
      fs.rmSync(dfRoot, {recursive: true, force: true});
      if (tmp) {
        fs.rmSync(tmp, {recursive: true, force: true});
      }
    }
  },
);

test('local mode keeps each run under --report-dir', {timeout: 300000}, () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-e2e-local-'));
  let tmp = '';
  try {
    const run = runRunner(
      [
        '--platform',
        'android',
        '--each-model',
        '--mode',
        'local',
        '--skip-build',
        '--report-dir',
        reportDir,
      ],
      {},
    );
    tmp = run.tmp;
    assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
    assert.ok(run.calls.length > 1, 'expected one wdio run per model');
    for (const call of run.calls) {
      assert.ok(isInside(call.logDir, reportDir), call.logDir);
      assert.ok(isInside(call.screenshotDir, reportDir), call.screenshotDir);
    }
    assert.equal(
      new Set(run.calls.map(call => call.logDir)).size,
      run.calls.length,
    );
    assert.ok(fs.existsSync(path.join(reportDir, 'junit-results.xml')));
  } finally {
    fs.rmSync(reportDir, {recursive: true, force: true});
    if (tmp) {
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  }
});

test(
  'device-farm mode keeps each run under an explicit --report-dir',
  {timeout: 300000},
  () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-e2e-dir-'));
    const dfLog = fs.mkdtempSync(path.join(os.tmpdir(), 'run-e2e-df-log-'));
    let tmp = '';
    try {
      const run = runRunner(
        [
          '--platform',
          'android',
          '--each-model',
          '--mode',
          'device-farm',
          '--report-dir',
          reportDir,
        ],
        {DEVICEFARM_LOG_DIR: dfLog},
      );
      tmp = run.tmp;
      assert.equal(
        run.result.status,
        0,
        run.result.stderr || run.result.stdout,
      );
      assert.ok(run.calls.length > 1, 'expected one wdio run per model');
      for (const call of run.calls) {
        assert.ok(isInside(call.logDir, reportDir), call.logDir);
      }
      assert.ok(fs.existsSync(path.join(reportDir, 'junit-results.xml')));
      assert.deepEqual(listFiles(dfLog), []);
    } finally {
      fs.rmSync(reportDir, {recursive: true, force: true});
      fs.rmSync(dfLog, {recursive: true, force: true});
      if (tmp) {
        fs.rmSync(tmp, {recursive: true, force: true});
      }
    }
  },
);
