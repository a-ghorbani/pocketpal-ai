const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'verify-plus-gate.sh');
const MARKER = 'PLUS_STORE_GATE_ON';
const GATED = `var a=1;exports.PLUS_STORE_GATE_MARKER="${MARKER}";`;
const UNGATED = 'var a=1;exports.PLUS_STORE_GATE_MARKER=null;';

const BUNDLE_ENTRY = {
  apk: 'assets/index.android.bundle',
  aab: 'base/assets/index.android.bundle',
  ipa: 'Payload/PocketPal.app/main.jsbundle',
};

let workspace;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-plus-gate-'));
});

afterEach(() => {
  fs.rmSync(workspace, {recursive: true, force: true});
});

function writeArchive(name, entries) {
  const staging = fs.mkdtempSync(path.join(workspace, 'staging-'));
  const roots = new Set();
  for (const [entry, contents] of Object.entries(entries)) {
    const target = path.join(staging, entry);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, contents);
    roots.add(entry.split('/')[0]);
  }
  const archive = path.join(workspace, name);
  execFileSync('zip', ['-q', '-r', '-X', archive, ...roots], {cwd: staging});
  return archive;
}

function writeApp(bundle) {
  const app = path.join(workspace, 'PocketPal.app');
  fs.mkdirSync(app);
  if (bundle !== undefined) {
    fs.writeFileSync(path.join(app, 'main.jsbundle'), bundle);
  }
  return app;
}

function artifact(kind, bundle) {
  return kind === 'app'
    ? writeApp(bundle)
    : writeArchive(`PocketPal.${kind}`, {
        [BUNDLE_ENTRY[kind]]: bundle,
        'AndroidManifest.xml': 'manifest',
      });
}

function run(args) {
  const result = spawnSync('bash', [SCRIPT, ...args], {encoding: 'utf-8'});
  return {status: result.status, output: `${result.stdout}${result.stderr}`};
}

describe.each(['apk', 'aab', 'ipa', 'app'])('a .%s', kind => {
  it('passes --gated with the marker and fails --ungated', () => {
    const file = artifact(kind, GATED);
    expect(run([file, '--gated']).status).toBe(0);
    const ungated = run([file, '--ungated']);
    expect(ungated.status).not.toBe(0);
    expect(ungated.output).toContain('PLUS_STORE_GATE');
  });

  it('passes --ungated without the marker and fails --gated', () => {
    const file = artifact(kind, UNGATED);
    expect(run([file, '--ungated']).status).toBe(0);
    const gated = run([file, '--gated']);
    expect(gated.status).not.toBe(0);
    expect(gated.output).toContain('--gated');
    expect(gated.output).toContain('PLUS_STORE_GATE=true');
  });

  it.each(['--gated', '--ungated'])('fails %s on an empty bundle', mode => {
    const result = run([artifact(kind, ''), mode]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('empty');
    expect(result.output).toContain('PLUS_STORE_GATE');
  });
});

describe('a bundle over 1 MB with the marker near the start', () => {
  it('is read whole in both modes', () => {
    const bundle = GATED + 'x'.repeat(2 * 1024 * 1024);
    const file = artifact('apk', bundle);
    expect(run([file, '--gated']).status).toBe(0);
    expect(run([file, '--ungated']).status).not.toBe(0);
  });
});

describe('fails closed', () => {
  it.each(['--gated', '--ungated'])(
    'on an archive without the bundle entry (%s)',
    mode => {
      const file = writeArchive('PocketPal.apk', {'AndroidManifest.xml': 'm'});
      const result = run([file, mode]);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain('assets/index.android.bundle not found');
      expect(result.output).toContain('PLUS_STORE_GATE');
    },
  );

  it('on a bundle at the wrong path of an .aab', () => {
    const file = writeArchive('PocketPal.aab', {
      [BUNDLE_ENTRY.apk]: UNGATED,
    });
    expect(run([file, '--ungated']).status).not.toBe(0);
  });

  it.each(['--gated', '--ungated'])(
    'on an .app without main.jsbundle (%s)',
    mode => {
      const result = run([writeApp(), mode]);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain('main.jsbundle not found');
    },
  );

  it.each(['--gated', '--ungated'])('on a corrupt archive (%s)', mode => {
    const file = path.join(workspace, 'PocketPal.apk');
    fs.writeFileSync(file, 'not a zip');
    const result = run([file, mode]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('PLUS_STORE_GATE');
  });

  it.each(['--gated', '--ungated'])('on a missing artifact (%s)', mode => {
    const result = run([path.join(workspace, 'missing.apk'), mode]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('not found');
  });

  it.each(['--gated', '--ungated'])('on an unknown extension (%s)', mode => {
    const file = path.join(workspace, 'PocketPal.zip');
    fs.writeFileSync(file, GATED);
    const result = run([file, mode]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('unknown artifact type');
  });
});

describe('arguments', () => {
  it.each([
    [[]],
    [['a.apk']],
    [['a.apk', '--gate']],
    [['a.apk', '--gated', 'x']],
  ])('prints usage and exits 64 for %j', args => {
    const result = run(args);
    expect(result.output).toMatch(/^usage: /);
    expect(result.status).toBe(64);
  });
});

describe('the marker', () => {
  it('is the literal gate.ts exports when gated', () => {
    const gate = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'services', 'plus', 'gate.ts'),
      'utf-8',
    );
    expect(fs.readFileSync(SCRIPT, 'utf-8')).toMatch(
      new RegExp(`^MARKER=${MARKER}$`, 'm'),
    );
    expect(gate).toContain(`? '${MARKER}'`);
  });
});
