#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const REASSURE_DIR = path.join(process.cwd(), '.reassure');
const DOCS_PATH = 'docs/render-perf-tests.md';
const HEADING = '## Render-perf gate';
const TEST_INPUTS_NOTE =
  'Note: this PR changes perf tests or their Jest setup; count changes may come from the tests themselves.';

const FAILING_STATES = [
  'unrecognised-output',
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

const formatPercent = ratio =>
  `${ratio > 0 ? '+' : ''}${(ratio * 100).toFixed(1)}%`;

const docsLinkFor = (env, head) =>
  env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && head
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/blob/${head}/${DOCS_PATH}#reading-the-result`
    : DOCS_PATH;

const readingLine = docsLink =>
  `How to read this: [Reading the result](${docsLink})`;

const reassureFold = report =>
  [
    '<details>',
    '<summary>Reassure report (durations are informational)</summary>',
    '',
    report.trim(),
    '',
    '</details>',
  ].join('\n');

const bulletList = items => items.map(item => `- ${item}`).join('\n');

const durationTable = entries =>
  [
    '| Scenario | Base | Head | Change |',
    '| --- | --- | --- | --- |',
    ...entries.map(
      e =>
        `| ${e.name} | ${formatMs(e.baseline.meanDuration)} | ${formatMs(
          e.current.meanDuration,
        )} | ${formatPercent(e.relativeDurationDiff)} |`,
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

const OUTPUT_ARRAYS = ['significant', 'meaningless', 'added', 'removed'];

const isFiniteNumber = value =>
  typeof value === 'number' && Number.isFinite(value);

const countFieldIssues = (entry, where) => {
  const issues = [];
  for (const field of ['meanCount', 'stdevCount']) {
    if (!isFiniteNumber(entry?.[field])) {
      issues.push(`${where}.${field}`);
    }
  }
  if (!Array.isArray(entry?.counts) || !entry.counts.every(isFiniteNumber)) {
    issues.push(`${where}.counts`);
  }
  return issues;
};

const validate = ({currentEntries, baselineEntries, output, bootstrap}) => {
  const issues = [];
  const add = (name, fields) =>
    fields.forEach(field => issues.push(`${name}: ${field}`));

  currentEntries.forEach(e => add(e.name, countFieldIssues(e, 'current.perf')));

  if (bootstrap || !output) {
    return issues;
  }

  const missing = OUTPUT_ARRAYS.filter(key => !Array.isArray(output[key]));
  if (missing.length) {
    add('output.json', missing);
    return issues;
  }

  [...output.significant, ...output.meaningless].forEach(e => {
    add(e.name, countFieldIssues(e.current, 'output.json current'));
    add(e.name, countFieldIssues(e.baseline, 'output.json baseline'));
  });

  if (!baselineEntries) {
    add('baseline.perf', ['missing after a compared run']);
    return issues;
  }
  const baseNames = new Set(baselineEntries.map(e => e.name));
  const headNames = new Set(currentEntries.map(e => e.name));
  output.added
    .filter(e => baseNames.has(e.name))
    .forEach(e => add(e.name, ['reported as added but measured on base']));
  output.removed
    .filter(e => headNames.has(e.name))
    .forEach(e => add(e.name, ['reported as removed but measured on head']));

  const reported = [
    ...output.significant,
    ...output.meaningless,
    ...output.added,
  ].map(e => e.name);
  currentEntries.forEach(({name}) => {
    const times = reported.filter(r => r === name).length;
    if (times !== 1) {
      add(name, [`reported ${times} times in output.json`]);
    }
  });

  return issues;
};

const finish = (
  states,
  sections,
  {docsLink, testInputsChanged, reassureReport},
) => {
  const failing = FAILING_STATES.filter(state => states.has(state));
  const failed = failing.length > 0;
  const parts = [
    HEADING,
    failed
      ? `**Render-perf gate: FAIL** (${failing.join(', ')})`
      : '**Render-perf gate: PASS**',
  ];
  if (failed) {
    parts.push(readingLine(docsLink));
  }
  if (testInputsChanged) {
    parts.push(TEST_INPUTS_NOTE);
  }
  parts.push(...sections);
  if (reassureReport) {
    parts.push(reassureFold(reassureReport));
  }

  return {failed, states: [...states], markdown: parts.join('\n\n')};
};

const renderRunFailed = ({cause, docsLink}) =>
  [
    HEADING,
    '**Render-perf gate: FAIL** (run-failed)',
    `Run failed on ${cause}. See the job log.`,
    readingLine(docsLink),
  ].join('\n\n');

const evaluate = ({
  currentEntries,
  baselineEntries = null,
  output,
  bootstrap,
  testInputsChanged = false,
  docsLink = DOCS_PATH,
  reassureReport = null,
}) => {
  const layout = {docsLink, testInputsChanged, reassureReport};
  const states = new Set();
  const sections = [];
  const section = (title, body) => sections.push(`**${title}**\n\n${body}`);

  const issues = validate({
    currentEntries,
    baselineEntries,
    output,
    bootstrap,
  });
  if (issues.length) {
    states.add('unrecognised-output');
    section(
      "Reassure's output format is not the one this gate reads (fails)",
      bulletList(issues),
    );
    return finish(states, sections, layout);
  }

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

  return finish(states, sections, layout);
};

const argValue = (args, flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const readIfPresent = file =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

const main = () => {
  const args = process.argv.slice(2);
  const docsLink = docsLinkFor(process.env, argValue(args, '--head'));
  const runFailed = argValue(args, '--run-failed');

  let result;
  if (runFailed !== undefined) {
    result = {
      failed: true,
      markdown: renderRunFailed({cause: runFailed, docsLink}),
    };
  } else {
    const bootstrap = args.includes('--bootstrap');
    const currentEntries = parsePerf(
      fs.readFileSync(path.join(REASSURE_DIR, 'current.perf'), 'utf8'),
    );
    const outputJson = bootstrap
      ? null
      : readIfPresent(path.join(REASSURE_DIR, 'output.json'));
    const baselinePerf = bootstrap
      ? null
      : readIfPresent(path.join(REASSURE_DIR, 'baseline.perf'));
    result = evaluate({
      currentEntries,
      baselineEntries: baselinePerf === null ? null : parsePerf(baselinePerf),
      output: outputJson === null ? null : JSON.parse(outputJson),
      bootstrap,
      testInputsChanged: args.includes('--test-inputs-changed'),
      docsLink,
      reassureReport: readIfPresent(path.join(REASSURE_DIR, 'output.md')),
    });
  }

  fs.mkdirSync(REASSURE_DIR, {recursive: true});
  fs.writeFileSync(path.join(REASSURE_DIR, 'gate.md'), `${result.markdown}\n`);
  console.log(result.markdown);
  process.exitCode = result.failed ? 1 : 0;
};

if (require.main === module) {
  main();
}

module.exports = {evaluate, parsePerf, renderRunFailed};
