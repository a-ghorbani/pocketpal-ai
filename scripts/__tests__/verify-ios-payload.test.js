const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'verify-ios-payload.sh');
const CHECKS = {
  app: 'app bundle',
  exe: 'executable',
  metallib: 'rnllama.metallib at the .app root',
  tensorMetallib: 'ggml-tensor.metallib at the .app root',
  whisperMetallib: 'default.metallib at the .app root',
  onlyKnown: 'no .metallib other than those three at the .app root',
  noWhisperFramework: 'no Frameworks/rnwhisper.framework in the .app',
  notEmbedded: 'no __ggml_metallib section in the executable',
  marker: 'core patch marker _rnllama_patch_abort_v3 in the executable',
};

const OTOOL_CLEAN = 'Section\n  sectname __text\n   segname __TEXT\n';
const OTOOL_EMBEDDED = `${OTOOL_CLEAN}Section\n  sectname __ggml_metallib\n   segname __DATA\n`;
const NM_MARKED =
  '0000000100001000 T _main\n0000000100002000 T _rnllama_patch_abort_v3\n';

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-ios-payload-'));
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const tool of ['otool', 'nm']) {
    const upper = tool.toUpperCase();
    fs.writeFileSync(
      path.join(bin, tool),
      `#!/bin/bash\n[ -n "\${STUB_${upper}_FAIL:-}" ] && exit 1\ncat "$STUB_${upper}_OUT"\n`,
      {mode: 0o755},
    );
  }
});

afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

function makeApp(name = 'PocketPal.app') {
  const app = path.join(tmp, name);
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, 'PocketPal'), 'exe');
  fs.writeFileSync(path.join(app, 'rnllama.metallib'), 'metallib');
  fs.writeFileSync(path.join(app, 'ggml-tensor.metallib'), 'metallib');
  fs.writeFileSync(path.join(app, 'default.metallib'), 'metallib');
  return app;
}

function run(args, {otool = OTOOL_CLEAN, nm = NM_MARKED, env = {}} = {}) {
  fs.writeFileSync(path.join(tmp, 'otool.out'), otool);
  fs.writeFileSync(path.join(tmp, 'nm.out'), nm);
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${path.join(tmp, 'bin')}:${process.env.PATH}`,
      STUB_OTOOL_OUT: path.join(tmp, 'otool.out'),
      STUB_NM_OUT: path.join(tmp, 'nm.out'),
      ...env,
    },
  });
  const lines = result.stdout.split('\n').filter(Boolean);
  const failed = Object.keys(CHECKS).filter(key =>
    lines.some(line => line.startsWith(`FAIL ${CHECKS[key]}`)),
  );
  const passed = Object.keys(CHECKS).filter(key =>
    lines.some(line => line.startsWith(`ok   ${CHECKS[key]}`)),
  );
  return {status: result.status, stderr: result.stderr, lines, failed, passed};
}

describe('a complete bundle', () => {
  it('passes every check, the core marker included', () => {
    const result = run([makeApp(), '--require-marker']);
    expect(result.failed).toEqual([]);
    expect(result.passed).toEqual(Object.keys(CHECKS));
    expect(result.lines).toHaveLength(Object.keys(CHECKS).length);
    expect(result.status).toBe(0);
  });

  it('skips only the marker without --require-marker', () => {
    const result = run([makeApp()], {nm: ''});
    expect(result.failed).toEqual([]);
    expect(result.passed).not.toContain('marker');
    expect(result.lines).toHaveLength(Object.keys(CHECKS).length - 1);
    expect(result.status).toBe(0);
  });

  it('accepts the bundle path with a trailing slash', () => {
    const result = run([`${makeApp()}/`, '--require-marker']);
    expect(result.failed).toEqual([]);
    expect(result.status).toBe(0);
  });
});

describe('the precompiled libraries', () => {
  it.each([
    ['rnllama.metallib', 'metallib'],
    ['ggml-tensor.metallib', 'tensorMetallib'],
    ['default.metallib', 'whisperMetallib'],
  ])('fails when %s is missing', (lib, check) => {
    const app = makeApp();
    fs.rmSync(path.join(app, lib));
    const result = run([app]);
    expect(result.failed).toEqual([check]);
    expect(result.status).toBe(1);
  });

  it.each(['whisper.metallib', 'rnllama-tensor.metallib', 'ggml.metallib'])(
    'fails on %s beside them, and names it',
    extra => {
      const app = makeApp();
      fs.writeFileSync(path.join(app, extra), 'metallib');
      const result = run([app]);
      expect(result.failed).toEqual(['onlyKnown']);
      expect(result.stderr).toContain(`unexpected ${extra}`);
      expect(result.status).toBe(1);
    },
  );

  it('fails on another library even when rnllama.metallib is missing', () => {
    const app = makeApp();
    fs.renameSync(
      path.join(app, 'rnllama.metallib'),
      path.join(app, 'ggml.metallib'),
    );
    const result = run([app]);
    expect(result.failed).toEqual(['metallib', 'onlyKnown']);
    expect(result.status).toBe(1);
  });
});

describe('whisper.rn', () => {
  it('fails on a Frameworks/rnwhisper.framework', () => {
    const app = makeApp();
    fs.mkdirSync(path.join(app, 'Frameworks', 'rnwhisper.framework'), {
      recursive: true,
    });
    const result = run([app]);
    expect(result.failed).toEqual(['noWhisperFramework']);
    expect(result.status).toBe(1);
  });

  it('passes with other frameworks in Frameworks/', () => {
    const app = makeApp();
    fs.mkdirSync(path.join(app, 'Frameworks', 'hermes.framework'), {
      recursive: true,
    });
    expect(run([app]).failed).toEqual([]);
  });
});

describe('the executable', () => {
  it('fails on an embedded __ggml_metallib section', () => {
    const result = run([makeApp()], {otool: OTOOL_EMBEDDED});
    expect(result.failed).toEqual(['notEmbedded']);
    expect(result.status).toBe(1);
  });

  it('fails when otool cannot read it, rather than passing', () => {
    const result = run([makeApp()], {env: {STUB_OTOOL_FAIL: '1'}});
    expect(result.failed).toEqual(['notEmbedded']);
    expect(result.status).toBe(1);
  });

  it('fails when the marker is required and absent', () => {
    const result = run([makeApp(), '--require-marker'], {
      nm: '0000000100001000 T _main\n',
    });
    expect(result.failed).toEqual(['marker']);
    expect(result.status).toBe(1);
  });

  it('matches the marker by exact name only', () => {
    const result = run([makeApp(), '--require-marker'], {
      nm: '0000000100002000 T _rnllama_patch_abort_v3_old\n0000000100003000 T __rnllama_patch_abort_v3\n',
    });
    expect(result.failed).toEqual(['marker']);
    expect(result.status).toBe(1);
  });

  it('fails the marker when nm cannot read it, rather than passing', () => {
    const result = run([makeApp(), '--require-marker'], {
      env: {STUB_NM_FAIL: '1'},
    });
    expect(result.failed).toEqual(['marker']);
    expect(result.status).toBe(1);
  });

  it('fails every executable check when it is missing', () => {
    const app = makeApp();
    fs.rmSync(path.join(app, 'PocketPal'));
    const result = run([app, '--require-marker']);
    expect(result.failed).toEqual(['exe', 'notEmbedded', 'marker']);
    expect(result.status).toBe(1);
  });

  it('names the executable after the bundle', () => {
    const app = makeApp('Other.app');
    const result = run([app]);
    expect(result.failed).toEqual(['exe', 'notEmbedded']);
    fs.renameSync(path.join(app, 'PocketPal'), path.join(app, 'Other'));
    expect(run([app]).failed).toEqual([]);
  });
});

describe('arguments', () => {
  it('fails on a missing bundle', () => {
    const result = run([path.join(tmp, 'Missing.app')]);
    expect(result.failed).toEqual(
      expect.arrayContaining([
        'app',
        'exe',
        'metallib',
        'tensorMetallib',
        'whisperMetallib',
      ]),
    );
    expect(result.status).toBe(1);
  });

  it.each([
    [[]],
    [['a.app', '--marker']],
    [['a.app', '--require-marker', 'x']],
  ])('prints usage and exits 64 for %j', args => {
    const result = run(args);
    expect(result.stderr).toMatch(/^usage: /);
    expect(result.lines).toEqual([]);
    expect(result.status).toBe(64);
  });
});
