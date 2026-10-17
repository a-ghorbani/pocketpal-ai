#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const REASSURE_DIR = path.join(process.cwd(), '.reassure');

const FAILING_STATES = [
  'count-up',
  'count-unstable',
  'duplicate-name',
  'baseline-lost',
];

const parsePerf = text =>
  text
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
    .filter(entry => entry.metadata === undefined);

const formatMs = ms => `${ms.toFixed(1)} ms`;

const bulletList = items => items.map(item => `- ${item}`).join('\n');

const durationTable = entries =>
  [
    '| Scenario | Base | Head | Change |',
    '| --- | --- | --- | --- |',
    ...entries.map(
      e =>
        `| ${e.name} | ${formatMs(e.baseline.meanDuration)} | ${formatMs(
          e.current.meanDuration,
        )} | ${(e.relativeDurationDiff * 100).toFixed(1)}% |`,
    ),
  ].join('\n');

const headTable = entries =>
  [
    '| Scenario | Render count | Mean duration |',
    '| --- | --- | --- |',
    ...entries.map(
      e => `| ${e.name} | ${e.meanCount} | ${formatMs(e.meanDuration)} |`,
    ),
  ].join('\n');

const evaluate = ({currentEntries, output, bootstrap}) => {
  const states = new Set();
  const sections = [];
  const section = (title, body) => sections.push(`**${title}**\n\n${body}`);

  const unstable = currentEntries.filter(e => e.stdevCount > 0);
  if (unstable.length) {
    states.add('count-unstable');
    section(
      'Render count varies across runs (fails)',
      bulletList(unstable.map(e => `${e.name}: ${e.counts.join(', ')}`)),
    );
  }

  if (bootstrap) {
    states.add('bootstrap');
    const names = currentEntries.map(e => e.name);
    const duplicated = [
      ...new Set(names.filter((name, i) => names.indexOf(name) !== i)),
    ];
    if (duplicated.length) {
      states.add('duplicate-name');
      section('Duplicate scenario names (fails)', bulletList(duplicated));
    }
    section(
      'No baseline on base: render counts on head',
      headTable(currentEntries),
    );
  } else if (!output) {
    states.add('baseline-lost');
    section(
      'Baseline expected, no comparison (fails)',
      'Base was measured, but `.reassure/output.json` is missing.',
    );
  } else {
    const compared = [...output.significant, ...output.meaningless];
    const countUp = compared.filter(
      e => e.current.meanCount > e.baseline.meanCount,
    );
    const countDown = compared.filter(
      e => e.current.meanCount < e.baseline.meanCount,
    );
    const unchanged = compared.filter(
      e => e.current.meanCount === e.baseline.meanCount,
    );
    const durationOnly = unchanged.filter(e => e.isDurationDiffSignificant);
    const countChange = e =>
      `${e.name}: ${e.baseline.meanCount} → ${e.current.meanCount}`;

    if (countUp.length) {
      states.add('count-up');
      section(
        'Render count increased (fails)',
        bulletList(countUp.map(countChange)),
      );
    }
    if (countDown.length) {
      states.add('count-down');
      section('Render count decreased', bulletList(countDown.map(countChange)));
    }
    if (unchanged.length) {
      states.add('unchanged');
      section(
        'Render count unchanged',
        bulletList(unchanged.map(e => `${e.name}: ${e.current.meanCount}`)),
      );
    }
    if (durationOnly.length) {
      states.add('duration-only');
      section(
        'Duration changes with equal render count (informational)',
        durationTable(durationOnly),
      );
    }
    if (output.added.length) {
      states.add('added');
      section(
        'Added scenarios (not compared)',
        bulletList(output.added.map(e => e.name)),
      );
    }
    if (output.removed.length) {
      states.add('removed');
      section(
        'Removed scenarios (not compared)',
        bulletList(output.removed.map(e => e.name)),
      );
    }
  }

  const failing = FAILING_STATES.filter(state => states.has(state));
  const failed = failing.length > 0;
  const verdict = failed
    ? `**Render-perf gate: FAIL** (${failing.join(', ')})`
    : '**Render-perf gate: PASS**';
  const markdown = ['## Render-perf gate', ...sections, verdict].join('\n\n');

  return {failed, states: [...states], markdown};
};

const main = () => {
  const bootstrap = process.argv.includes('--bootstrap');
  const currentEntries = parsePerf(
    fs.readFileSync(path.join(REASSURE_DIR, 'current.perf'), 'utf8'),
  );
  const outputPath = path.join(REASSURE_DIR, 'output.json');
  const output =
    !bootstrap && fs.existsSync(outputPath)
      ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
      : null;

  const result = evaluate({currentEntries, output, bootstrap});
  console.log(result.markdown);
  process.exitCode = result.failed ? 1 : 0;
};

if (require.main === module) {
  main();
}

module.exports = {evaluate, parsePerf};
