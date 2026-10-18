const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {evaluate, parsePerf, renderRunFailed} = require('../perf-gate');

const FIXTURES = path.join(__dirname, 'fixtures', 'perf');
const SCRIPT = path.join(__dirname, '..', 'perf-gate.js');

const readFixture = name => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const loadCurrent = () => parsePerf(readFixture('current.perf'));
const loadOutput = () => JSON.parse(readFixture('output.json'));
const loadBaseline = () => parsePerf(readFixture('baseline.perf'));

const SETTINGS =
  'SettingsScreen render performance expands the advanced settings';
const SHEET = 'Sheet render performance opens and closes from the owner state';

const findCompared = (output, name) =>
  [...output.significant, ...output.meaningless].find(e => e.name === name);

const withCount = (entry, counts) => {
  entry.counts = counts;
  entry.meanCount = counts.reduce((a, b) => a + b, 0) / counts.length;
};

const removeCompared = (output, name) => {
  const entry = findCompared(output, name);
  output.significant = output.significant.filter(e => e !== entry);
  output.meaningless = output.meaningless.filter(e => e !== entry);
  return entry;
};

const verdictLine = markdown => markdown.split('\n')[2];

const READING_LOCAL =
  'How to read this: [Reading the result](docs/render-perf-tests.md)';

describe('perf-gate', () => {
  it('passes the verbatim comparison of identical code', () => {
    const result = evaluate({
      currentEntries: loadCurrent(),
      output: loadOutput(),
      bootstrap: false,
      baselineEntries: loadBaseline(),
    });

    expect(result.failed).toBe(false);
    expect(result.states).toEqual(
      expect.arrayContaining(['unchanged', 'duration-only']),
    );
    expect(result.markdown).toContain(`${SETTINGS}: 4`);
    expect(result.markdown).toContain('(informational)');
    expect(verdictLine(result.markdown)).toBe('**Render-perf gate: PASS**');
  });

  it('fails on any render count increase and names the scenario', () => {
    const output = loadOutput();
    withCount(findCompared(output, SETTINGS).current, [5, 5, 5]);

    const result = evaluate({
      currentEntries: loadCurrent(),
      output,
      bootstrap: false,
      baselineEntries: loadBaseline(),
    });

    expect(result.failed).toBe(true);
    expect(result.states).toContain('count-up');
    expect(result.markdown).toContain(`${SETTINGS}: 4 → 5`);
    expect(verdictLine(result.markdown)).toBe(
      '**Render-perf gate: FAIL** (count-up)',
    );
  });

  it('fails on a fractional increase below the report threshold', () => {
    const output = loadOutput();
    withCount(findCompared(output, SETTINGS).current, [4, 4, 5]);

    const result = evaluate({
      currentEntries: loadCurrent(),
      output,
      bootstrap: false,
      baselineEntries: loadBaseline(),
    });

    expect(result.failed).toBe(true);
    expect(result.states).toContain('count-up');
  });

  it('passes a render count decrease and lists it', () => {
    const output = loadOutput();
    withCount(findCompared(output, SETTINGS).current, [3, 3, 3]);

    const result = evaluate({
      currentEntries: loadCurrent(),
      output,
      bootstrap: false,
      baselineEntries: loadBaseline(),
    });

    expect(result.failed).toBe(false);
    expect(result.states).toContain('count-down');
    expect(result.markdown).toContain(`${SETTINGS}: 4 → 3`);
  });

  it('fails when a head scenario count varies across runs', () => {
    const currentEntries = loadCurrent();
    const sheet = currentEntries.find(e => e.name === SHEET);
    sheet.counts = [3, 4, 3];
    sheet.stdevCount = 0.5773502691896258;

    const result = evaluate({
      currentEntries,
      output: loadOutput(),
      bootstrap: false,
      baselineEntries: loadBaseline(),
    });

    expect(result.failed).toBe(true);
    expect(result.states).toContain('count-unstable');
    expect(result.markdown).toContain(`${SHEET}: 3, 4, 3`);
  });

  it('passes a duration-only change as informational', () => {
    const output = loadOutput();
    const settings = removeCompared(output, SETTINGS);
    settings.isDurationDiffSignificant = true;
    output.significant.push(settings);

    const result = evaluate({
      currentEntries: loadCurrent(),
      output,
      bootstrap: false,
      baselineEntries: loadBaseline(),
    });

    expect(result.failed).toBe(false);
    expect(result.markdown).toMatch(
      new RegExp(`\\| ${SETTINGS} \\| [0-9.]+ ms \\| [0-9.]+ ms \\|`),
    );
  });

  it('lists a renamed scenario as removed and added without comparing it', () => {
    const output = loadOutput();
    const settings = removeCompared(output, SETTINGS);
    const renamed = `${SETTINGS} renamed`;
    output.removed.push({
      name: SETTINGS,
      type: 'render',
      baseline: settings.baseline,
    });
    output.added.push({
      name: renamed,
      type: 'render',
      current: {...settings.current, name: renamed},
    });
    const currentEntries = loadCurrent();
    currentEntries.find(e => e.name === SETTINGS).name = renamed;

    const result = evaluate({
      currentEntries,
      output,
      bootstrap: false,
      baselineEntries: loadBaseline(),
    });

    expect(result.failed).toBe(false);
    expect(result.states).toEqual(expect.arrayContaining(['added', 'removed']));
    expect(result.markdown).toContain(`- ${renamed}`);
    expect(result.markdown.split('\n')).toContain(`- ${SETTINGS}`);
  });

  it('fails a count increase reported alongside an added scenario', () => {
    const output = loadOutput();
    withCount(findCompared(output, SHEET).current, [4, 4, 4]);
    const settings = removeCompared(output, SETTINGS);
    output.added.push({
      name: SETTINGS,
      type: 'render',
      current: settings.current,
    });

    const result = evaluate({
      currentEntries: loadCurrent(),
      output,
      bootstrap: false,
      baselineEntries: loadBaseline().filter(e => e.name !== SETTINGS),
    });

    expect(result.failed).toBe(true);
    expect(result.states).toEqual(
      expect.arrayContaining(['count-up', 'added']),
    );
  });

  it('fails when the base was measured but no comparison exists', () => {
    const result = evaluate({
      currentEntries: loadCurrent(),
      output: null,
      bootstrap: false,
      baselineEntries: loadBaseline(),
    });

    expect(result.failed).toBe(true);
    expect(result.states).toContain('baseline-lost');
  });

  it('passes a bootstrap run and reports head counts', () => {
    const result = evaluate({
      currentEntries: loadCurrent(),
      output: null,
      bootstrap: true,
    });

    expect(result.failed).toBe(false);
    expect(result.states).toContain('bootstrap');
    expect(result.markdown).toContain('No baseline on base');
    expect(result.markdown).toMatch(
      new RegExp(`\\| ${SETTINGS} \\| 4 \\| [0-9.]+ ms \\|`),
    );
  });

  it('fails a bootstrap run with duplicate scenario names', () => {
    const currentEntries = loadCurrent();
    currentEntries[1].name = currentEntries[0].name;

    const result = evaluate({currentEntries, output: null, bootstrap: true});

    expect(result.failed).toBe(true);
    expect(result.states).toContain('duplicate-name');
    expect(result.markdown).toContain(`- ${currentEntries[0].name}`);
  });

  describe('summary layout', () => {
    it('folds the verbatim Reassure report below the gate sections', () => {
      const report = readFixture('output.md');

      const {markdown} = evaluate({
        currentEntries: loadCurrent(),
        output: loadOutput(),
        bootstrap: false,
        baselineEntries: loadBaseline(),
        reassureReport: report,
      });

      const fold = markdown.indexOf('<details>');
      expect(
        markdown.startsWith(
          '## Render-perf gate\n\n**Render-perf gate: PASS**',
        ),
      ).toBe(true);
      expect(fold).toBeGreaterThan(
        markdown.indexOf('**Render count unchanged**'),
      );
      expect(markdown.indexOf(report.trim())).toBeGreaterThan(fold);
      expect(markdown.trim().endsWith('</details>')).toBe(true);
    });

    it('links the docs on failure only', () => {
      const output = loadOutput();
      const passed = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });
      withCount(findCompared(output, SHEET).current, [4, 4, 4]);

      const failed = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expect(passed.markdown).not.toContain('How to read this');
      expect(failed.markdown.split('\n')[4]).toBe(READING_LOCAL);
    });

    it('notes changed test inputs without changing the verdict', () => {
      const {markdown, failed} = evaluate({
        currentEntries: loadCurrent(),
        output: loadOutput(),
        bootstrap: false,
        baselineEntries: loadBaseline(),
        testInputsChanged: true,
      });

      expect(failed).toBe(false);
      expect(markdown).toContain(
        'Note: this PR changes perf tests or their Jest setup',
      );
    });

    it('signs duration changes', () => {
      const output = loadOutput();
      const sheet = findCompared(output, SHEET);
      const settings = findCompared(output, SETTINGS);
      sheet.isDurationDiffSignificant = true;
      sheet.relativeDurationDiff = 0.123;
      settings.isDurationDiffSignificant = true;
      settings.relativeDurationDiff = -0.04;

      const {markdown} = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expect(markdown).toMatch(
        new RegExp(`\\| ${SHEET} \\|.*\\| \\+12\\.3% \\|`),
      );
      expect(markdown).toMatch(
        new RegExp(`\\| ${SETTINGS} \\|.*\\| -4\\.0% \\|`),
      );
    });

    it('renders a failed run under the same heading and verdict line', () => {
      const markdown = renderRunFailed({
        cause: 'head: Jest or Reassure failure',
        docsLink: 'docs/render-perf-tests.md',
      });

      expect(markdown.split('\n\n')).toEqual([
        '## Render-perf gate',
        '**Render-perf gate: FAIL** (run-failed)',
        'Run failed on head: Jest or Reassure failure. See the job log.',
        READING_LOCAL,
      ]);
    });
  });

  describe('unrecognised Reassure output', () => {
    const expectUnrecognised = (result, field) => {
      expect(result.failed).toBe(true);
      expect(result.states).toEqual(['unrecognised-output']);
      expect(result.markdown).toContain(field);
    };

    it('fails when a current.perf count field is renamed', () => {
      const currentEntries = parsePerf(
        readFixture('current.perf').replace(/"meanCount"/g, '"meanCnt"'),
      );

      const result = evaluate({
        currentEntries,
        output: loadOutput(),
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expectUnrecognised(result, `${SETTINGS}: current.perf.meanCount`);
    });

    it('fails on a renamed field in a bootstrap run too', () => {
      const currentEntries = loadCurrent();
      delete currentEntries[0].stdevCount;

      const result = evaluate({currentEntries, output: null, bootstrap: true});

      expectUnrecognised(result, 'current.perf.stdevCount');
    });

    it('fails when a baseline stdevCount is not a number', () => {
      const output = loadOutput();
      findCompared(output, SHEET).baseline.stdevCount = '0';

      const result = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expectUnrecognised(result, `${SHEET}: output.json baseline.stdevCount`);
    });

    it('fails when counts is not an array of numbers', () => {
      const output = loadOutput();
      findCompared(output, SHEET).current.counts = '3,3,3';

      const result = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expectUnrecognised(result, `${SHEET}: output.json current.counts`);
    });

    it('fails when a result category is missing', () => {
      const output = loadOutput();
      delete output.added;

      const result = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expectUnrecognised(result, 'output.json: added');
    });

    it('fails when a measured scenario drops out of every category', () => {
      const output = loadOutput();
      removeCompared(output, SETTINGS);

      const result = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expectUnrecognised(
        result,
        `${SETTINGS}: reported 0 times in output.json`,
      );
    });

    it('fails when a scenario measured on base is reported as added', () => {
      const output = loadOutput();
      const settings = removeCompared(output, SETTINGS);
      withCount(settings.current, [5, 5, 5]);
      output.added.push({
        name: SETTINGS,
        type: 'render',
        current: settings.current,
      });

      const result = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expectUnrecognised(
        result,
        `${SETTINGS}: reported as added but measured on base`,
      );
    });

    it('fails when every scenario is reported as added and removed', () => {
      const output = loadOutput();
      const compared = [...output.significant, ...output.meaningless];
      output.significant = [];
      output.meaningless = [];
      output.added = compared.map(e => ({
        name: e.name,
        type: 'render',
        current: e.current,
      }));
      output.removed = compared.map(e => ({
        name: e.name,
        type: 'render',
        baseline: e.baseline,
      }));

      const result = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expectUnrecognised(
        result,
        `${SHEET}: reported as removed but measured on head`,
      );
    });

    it('fails when baseline.perf is missing after a compared run', () => {
      const result = evaluate({
        currentEntries: loadCurrent(),
        output: loadOutput(),
        bootstrap: false,
      });

      expectUnrecognised(result, 'baseline.perf: missing after a compared run');
    });

    it('fails when a measured scenario is reported in two categories', () => {
      const output = loadOutput();
      output.added.push({
        name: SHEET,
        type: 'render',
        current: findCompared(output, SHEET).current,
      });

      const result = evaluate({
        currentEntries: loadCurrent(),
        output,
        bootstrap: false,
        baselineEntries: loadBaseline(),
      });

      expectUnrecognised(result, `${SHEET}: reported 2 times in output.json`);
    });
  });

  describe('command line', () => {
    let dir;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-gate-'));
      fs.mkdirSync(path.join(dir, '.reassure'));
      for (const file of ['current.perf', 'baseline.perf']) {
        fs.copyFileSync(
          path.join(FIXTURES, file),
          path.join(dir, '.reassure', file),
        );
      }
    });

    afterEach(() => {
      fs.rmSync(dir, {recursive: true, force: true});
    });

    const {GITHUB_SERVER_URL, GITHUB_REPOSITORY, ...baseEnv} = process.env;
    const run = (args, env = {}) =>
      spawnSync('node', [SCRIPT, ...args], {
        cwd: dir,
        encoding: 'utf8',
        env: {...baseEnv, ...env},
      });
    const gateFile = () =>
      fs.readFileSync(path.join(dir, '.reassure', 'gate.md'), 'utf8');

    it('exits 0 on a bootstrap run', () => {
      const result = run(['--bootstrap']);

      expect(result.status).toBe(0);
      expect(verdictLine(result.stdout)).toBe('**Render-perf gate: PASS**');
    });

    it('exits 1 when the comparison is missing', () => {
      const result = run([]);

      expect(result.status).toBe(1);
      expect(verdictLine(result.stdout)).toBe(
        '**Render-perf gate: FAIL** (baseline-lost)',
      );
    });

    it('exits 1 on a count increase read from output.json', () => {
      const output = loadOutput();
      withCount(findCompared(output, SHEET).current, [4, 4, 4]);
      fs.writeFileSync(
        path.join(dir, '.reassure', 'output.json'),
        JSON.stringify(output),
      );

      const result = run([]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`${SHEET}: 3 → 4`);
      expect(gateFile()).toBe(result.stdout);
    });

    it('renders a failed run, writes gate.md and exits 1', () => {
      fs.rmSync(path.join(dir, '.reassure'), {recursive: true, force: true});

      const result = run(['--run-failed', 'head: Jest or Reassure failure']);

      expect(result.status).toBe(1);
      expect(verdictLine(gateFile())).toBe(
        '**Render-perf gate: FAIL** (run-failed)',
      );
      expect(gateFile()).toContain(READING_LOCAL);
    });

    it('links the docs at the measured head commit in CI', () => {
      const result = run(['--head', 'abc123'], {
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'owner/repo',
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        'How to read this: [Reading the result](https://github.com/owner/repo/blob/abc123/docs/render-perf-tests.md#reading-the-result)',
      );
    });
  });
});
