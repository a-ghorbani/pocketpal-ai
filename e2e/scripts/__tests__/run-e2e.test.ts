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
import {test} from 'node:test';

import {classifyCleanRun, parseJunitSuites} from '../run-e2e';

function suite(attrs: {tests: number; skipped: number; failures?: number}) {
  return `<testsuite name="spec" tests="${attrs.tests}" failures="${
    attrs.failures ?? 0
  }" errors="0" skipped="${attrs.skipped}">
  <testcase name="case"/>
</testsuite>`;
}

function report(...suites: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
${suites.join('\n')}
</testsuites>`;
}

test('parseJunitSuites sums counts across suites', () => {
  const {suites, counts} = parseJunitSuites(
    report(
      suite({tests: 2, skipped: 1}),
      suite({tests: 3, skipped: 0, failures: 1}),
    ),
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
  const {counts} = parseJunitSuites(report(suite({tests: 5, skipped: 5})));
  assert.equal(classifyCleanRun(counts), 'skipped');
});

test('a run where every test skipped across suites is skipped', () => {
  const {counts} = parseJunitSuites(
    report(suite({tests: 1, skipped: 1}), suite({tests: 1, skipped: 1})),
  );
  assert.equal(classifyCleanRun(counts), 'skipped');
});

test('a run with at least one executed test is passed', () => {
  const {counts} = parseJunitSuites(report(suite({tests: 2, skipped: 1})));
  assert.equal(classifyCleanRun(counts), 'passed');
});

test('a run without a JUnit report keeps its exit-code status', () => {
  assert.equal(classifyCleanRun(null), 'passed');
});
