const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {evaluate, parsePerf} = require('../perf-gate');

const FIXTURES = path.join(__dirname, 'fixtures', 'perf');
const SCRIPT = path.join(__dirname, '..', 'perf-gate.js');

const readFixture = name => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const loadCurrent = () => parsePerf(readFixture('current.perf'));
const loadOutput = () => JSON.parse(readFixture('output.json'));

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

const lastLine = markdown => markdown.trim().split('\n').pop();

describe('perf-gate', () => {
  it('passes the verbatim comparison of identical code', () => {
    const result = evaluate({
      currentEntries: loadCurrent(),
      output: loadOutput(),
      bootstrap: false,
    });

    expect(result.failed).toBe(false);
    expect(result.states).toEqual(
      expect.arrayContaining(['unchanged', 'duration-only']),
    );
    expect(result.markdown).toContain(`${SETTINGS}: 4`);
    expect(result.markdown).toContain('(informational)');
    expect(lastLine(result.markdown)).toBe('**Render-perf gate: PASS**');
  });

  it('fails on any render count increase and names the scenario', () => {
    const output = loadOutput();
    withCount(findCompared(output, SETTINGS).current, [5, 5, 5]);

    const result = evaluate({
      currentEntries: loadCurrent(),
      output,
      bootstrap: false,
    });

    expect(result.failed).toBe(true);
    expect(result.states).toContain('count-up');
    expect(result.markdown).toContain(`${SETTINGS}: 4 → 5`);
    expect(lastLine(result.markdown)).toBe(
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
    });

    expect(result.failed).toBe(false);
    expect(result.states).toEqual(expect.arrayContaining(['added', 'removed']));
    expect(result.markdown).toContain(`- ${renamed}`);
    expect(result.markdown).toContain(`- ${SETTINGS}\n`);
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
      });

      expectUnrecognised(
        result,
        `${SETTINGS}: reported 0 times in output.json`,
      );
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
      });

      expectUnrecognised(result, `${SHEET}: reported 2 times in output.json`);
    });
  });

  describe('command line', () => {
    let dir;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-gate-'));
      fs.mkdirSync(path.join(dir, '.reassure'));
      fs.copyFileSync(
        path.join(FIXTURES, 'current.perf'),
        path.join(dir, '.reassure', 'current.perf'),
      );
    });

    afterEach(() => {
      fs.rmSync(dir, {recursive: true, force: true});
    });

    const run = args =>
      spawnSync('node', [SCRIPT, ...args], {cwd: dir, encoding: 'utf8'});

    it('exits 0 on a bootstrap run', () => {
      const result = run(['--bootstrap']);

      expect(result.status).toBe(0);
      expect(lastLine(result.stdout)).toBe('**Render-perf gate: PASS**');
    });

    it('exits 1 when the comparison is missing', () => {
      const result = run([]);

      expect(result.status).toBe(1);
      expect(lastLine(result.stdout)).toBe(
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
    });
  });
});
