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
