const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'verify-ios-payload.sh');
const GGML_SRC = path.join(
  ROOT,
  'node_modules',
  'llama.rn',
  'vendor',
  'llama.cpp',
  'ggml',
  'src',
);
const KERNELS = path.join(GGML_SRC, 'ggml-metal', 'kernels');
const HEADERS = [
  path.join(GGML_SRC, 'ggml-metal', 'ggml-metal-impl.h'),
  path.join(GGML_SRC, 'ggml-common.h'),
];

const CHECKS = {
  app: 'app bundle',
  exe: 'executable',
  sources: 'llama.rn kernel sources found in node_modules',
  metallib: 'rnllama.metallib at the .app root',
  kernels: "kernels/ matches llama.rn's ggml-metal/kernels",
  implHeader: 'ggml-metal-impl.h at the .app root',
  commonHeader: 'ggml-common.h at the .app root',
  onlyRnllama: 'no .metallib other than rnllama.metallib at the .app root',
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
  fs.cpSync(KERNELS, path.join(app, 'kernels'), {recursive: true});
  for (const header of HEADERS) {
    fs.copyFileSync(header, path.join(app, path.basename(header)));
  }
  return app;
}

function run(
  args,
  {otool = OTOOL_CLEAN, nm = NM_MARKED, env = {}, script = SCRIPT} = {},
) {
  fs.writeFileSync(path.join(tmp, 'otool.out'), otool);
  fs.writeFileSync(path.join(tmp, 'nm.out'), nm);
  const {NODE_PATH, ...parentEnv} = process.env;
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf-8',
    env: {
      ...parentEnv,
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

describe('the parse itself', () => {
  it('has the vendored kernel sources and headers to build a bundle from', () => {
    expect(fs.readdirSync(KERNELS).length).toBeGreaterThan(0);
    for (const header of HEADERS) {
      expect(fs.existsSync(header)).toBe(true);
    }
  });
});

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

describe('the precompiled library', () => {
  it('fails when rnllama.metallib is missing', () => {
    const app = makeApp();
    fs.rmSync(path.join(app, 'rnllama.metallib'));
    const result = run([app]);
    expect(result.failed).toEqual(['metallib']);
    expect(result.status).toBe(1);
  });

  it.each([
    'default.metallib',
    'rnllama-tensor.metallib',
    'ggml-tensor.metallib',
  ])('fails on %s beside it, and names it', extra => {
    const app = makeApp();
    fs.writeFileSync(path.join(app, extra), 'metallib');
    const result = run([app]);
    expect(result.failed).toEqual(['onlyRnllama']);
    expect(result.stderr).toContain(`unexpected ${extra}`);
    expect(result.status).toBe(1);
  });

  it('fails on another library even when rnllama.metallib is missing', () => {
    const app = makeApp();
    fs.renameSync(
      path.join(app, 'rnllama.metallib'),
      path.join(app, 'default.metallib'),
    );
    const result = run([app]);
    expect(result.failed).toEqual(['metallib', 'onlyRnllama']);
    expect(result.status).toBe(1);
  });
});

describe('the kernel sources tensor GPUs compile', () => {
  it('fails when kernels/ is missing', () => {
    const app = makeApp();
    fs.rmSync(path.join(app, 'kernels'), {recursive: true});
    const result = run([app]);
    expect(result.failed).toEqual(['kernels']);
    expect(result.status).toBe(1);
  });

  it('fails when one kernel file is missing', () => {
    const app = makeApp();
    fs.rmSync(path.join(app, 'kernels', 'tri.metal'));
    const result = run([app]);
    expect(result.failed).toEqual(['kernels']);
    expect(result.status).toBe(1);
  });

  it('fails on a kernel file llama.rn does not ship', () => {
    const app = makeApp();
    fs.writeFileSync(path.join(app, 'kernels', 'removed_upstream.metal'), '');
    const result = run([app]);
    expect(result.failed).toEqual(['kernels']);
    expect(result.status).toBe(1);
  });

  it('fails on a stale kernel file', () => {
    const app = makeApp();
    fs.appendFileSync(path.join(app, 'kernels', 'common.h'), '\n');
    const result = run([app]);
    expect(result.failed).toEqual(['kernels']);
    expect(result.status).toBe(1);
  });

  it.each([
    ['ggml-metal-impl.h', 'implHeader'],
    ['ggml-common.h', 'commonHeader'],
  ])('fails when %s is missing from the root', (header, check) => {
    const app = makeApp();
    fs.rmSync(path.join(app, header));
    const result = run([app]);
    expect(result.failed).toEqual([check]);
    expect(result.status).toBe(1);
  });

  it.each([
    ['ggml-metal-impl.h', 'implHeader'],
    ['ggml-common.h', 'commonHeader'],
  ])('fails when %s at the root is stale', (header, check) => {
    const app = makeApp();
    fs.appendFileSync(path.join(app, header), '\n');
    const result = run([app]);
    expect(result.failed).toEqual([check]);
    expect(result.status).toBe(1);
  });

  it('fails every source check when llama.rn cannot be resolved, rather than passing', () => {
    const detached = path.join(tmp, 'detached', 'scripts');
    fs.mkdirSync(detached, {recursive: true});
    const script = path.join(detached, 'verify-ios-payload.sh');
    fs.copyFileSync(SCRIPT, script);
    const result = run([makeApp()], {script});
    expect(result.failed).toEqual([
      'sources',
      'kernels',
      'implHeader',
      'commonHeader',
    ]);
    expect(result.status).toBe(1);
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
      expect.arrayContaining(['app', 'exe', 'metallib', 'kernels']),
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
