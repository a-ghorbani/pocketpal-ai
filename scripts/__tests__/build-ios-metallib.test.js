const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'build-ios-metallib.sh');
const GGML_SRC = path.join(
  ROOT,
  'node_modules',
  'llama.rn',
  'vendor',
  'llama.cpp',
  'ggml',
  'src',
);
const GGML_METAL = path.join(GGML_SRC, 'ggml-metal');
const KERNELS = path.join(GGML_METAL, 'kernels');

const kernelSet = [
  ...(fs
    .readFileSync(path.join(GGML_METAL, 'ggml-metal-device.m'), 'utf-8')
    .match(/^#define GGML_METAL_LIBS((?:.*\\\n)+.*)/m) || ['', ''])[1].matchAll(
    /X\(\s*\w+\s*,\s*(\w+)\s*\)/g,
  ),
].map(match => match[1]);

const XCRUN = `#!/bin/bash
line=$(printf '%s\\x1f' "$@")
printf '%s\\n' "$line" >> "$XCRUN_LOG"
[ "$1" = -sdk ] && shift 2
tool=$1
shift
if [ "$tool" = metal ] && [ "$1" = -v ]; then
  [ -n "\${STUB_NO_METAL:-}" ] && exit 1
  exit 0
fi
out=""
prev=""
for arg in "$@"; do
  [ "$prev" = -o ] && out=$arg
  [ "$arg" = "$KERNELS_DIR/\${STUB_FAIL_KERNEL:-none}.metal" ] && { echo "error: stub" >&2; exit 1; }
  [ "$arg" = "$KERNELS_DIR/\${STUB_NO_OUTPUT_KERNEL:-none}.metal" ] && exit 0
  prev=$arg
done
echo "$tool" > "$out"
`;

// BSD xargs substitutes -I's replacement only into arguments of up to 255
// bytes; GNU xargs has no such limit, so the tests that need it install this.
const BSD_XARGS = `#!/bin/bash
real_xargs=$(PATH="\${PATH#*:}" command -v xargs)
args=("$@")
repl=""
for ((i = 0; i < \${#args[@]}; i++)); do
  [ "\${args[i]}" = -I ] && repl=\${args[i+1]}
done
[ -z "$repl" ] && exec "$real_xargs" "$@"
i=0
while [ "$i" -lt "\${#args[@]}" ]; do
  case "\${args[i]}" in
    -I | -P | -n | -S) i=$((i + 2)) ;;
    *) break ;;
  esac
done
cmd=("\${args[@]:i}")
status=0
while IFS= read -r item; do
  argv=()
  for arg in "\${cmd[@]}"; do
    if [ "\${#arg}" -le 255 ]; then argv+=("\${arg//"$repl"/$item}"); else argv+=("$arg"); fi
  done
  "\${argv[@]}" || status=123
done
exit "$status"
`;

let tmp;
let derived;
let app;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-ios-metallib-'));
  fs.mkdirSync(path.join(tmp, 'bin'));
  fs.writeFileSync(path.join(tmp, 'bin', 'xcrun'), XCRUN, {mode: 0o755});
  derived = path.join(tmp, 'DerivedSources');
  app = path.join(tmp, 'Products', 'PocketPal.app');
  fs.mkdirSync(derived, {recursive: true});
  fs.mkdirSync(app, {recursive: true});
});

afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

function run({
  platform = 'iphoneos',
  args = [GGML_SRC, ...kernelSet],
  env = {},
} = {}) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${path.join(tmp, 'bin')}:${process.env.PATH}`,
      XCRUN_LOG: path.join(tmp, 'xcrun.log'),
      KERNELS_DIR: KERNELS,
      PLATFORM_NAME: platform,
      DERIVED_FILE_DIR: derived,
      TARGET_BUILD_DIR: path.join(tmp, 'Products'),
      UNLOCALIZED_RESOURCES_FOLDER_PATH: 'PocketPal.app',
      ...env,
    },
  });
  const log = path.join(tmp, 'xcrun.log');
  const calls = fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map(line => line.split('\x1f').slice(0, -1))
    : [];
  return {status: result.status, stderr: result.stderr, calls};
}

const compiles = calls =>
  calls.filter(call => call[2] === 'metal' && call[3] !== '-v');
const sorted = calls =>
  [...calls].sort((a, b) => a.join('\x1f').localeCompare(b.join('\x1f')));
const appMetallibs = () =>
  fs.readdirSync(app).filter(name => name.endsWith('.metallib'));

describe('the parse itself', () => {
  it('finds the kernel set in the vendored ggml', () => {
    expect(kernelSet.length).toBeGreaterThan(0);
  });
});

describe.each([
  ['iphoneos', '-mtargetos=ios18.0'],
  ['iphonesimulator', '-mtargetos=ios18.0-simulator'],
])('the %s build', (platform, target) => {
  it('compiles each kernel for iOS 18 with bf16, and nothing else', () => {
    const {status, calls} = run({platform});
    expect(status).toBe(0);
    expect(sorted(compiles(calls))).toEqual(
      sorted(
        kernelSet.map(kernel => [
          '-sdk',
          platform,
          'metal',
          '-O3',
          target,
          '-DGGML_METAL_HAS_BF16',
          '-I',
          GGML_METAL,
          '-I',
          GGML_SRC,
          '-c',
          path.join(KERNELS, `${kernel}.metal`),
          '-o',
          path.join(derived, 'rnllama-metal', `${kernel}.air`),
        ]),
      ),
    );
  });

  it('links every kernel into one rnllama.metallib, after every compile', () => {
    const {calls} = run({platform});
    const links = calls.filter(call => call[2] === 'metallib');
    expect(calls[calls.length - 1][2]).toBe('metallib');
    expect(links).toEqual([
      [
        '-sdk',
        platform,
        'metallib',
        ...kernelSet.map(kernel =>
          path.join(derived, 'rnllama-metal', `${kernel}.air`),
        ),
        '-o',
        path.join(derived, 'rnllama.metallib'),
      ],
    ]);
  });
});

describe('the app bundle it writes', () => {
  it('holds rnllama.metallib as its only library', () => {
    expect(run().status).toBe(0);
    expect(appMetallibs()).toEqual(['rnllama.metallib']);
    expect(fs.readFileSync(path.join(app, 'rnllama.metallib'), 'utf-8')).toBe(
      'metallib\n',
    );
  });

  it('holds byte copies of every kernel source and both headers', () => {
    run();
    expect(fs.readdirSync(path.join(app, 'kernels')).sort()).toEqual(
      fs.readdirSync(KERNELS).sort(),
    );
    for (const name of fs.readdirSync(KERNELS)) {
      expect(
        fs
          .readFileSync(path.join(app, 'kernels', name))
          .equals(fs.readFileSync(path.join(KERNELS, name))),
      ).toBe(true);
    }
    for (const header of [
      path.join(GGML_METAL, 'ggml-metal-impl.h'),
      path.join(GGML_SRC, 'ggml-common.h'),
    ]) {
      expect(
        fs
          .readFileSync(path.join(app, path.basename(header)))
          .equals(fs.readFileSync(header)),
      ).toBe(true);
    }
  });

  it('keeps the intermediates out of the bundle', () => {
    run();
    const names = fs.readdirSync(app, {recursive: true});
    expect(names.filter(name => name.endsWith('.air'))).toEqual([]);
  });

  it('drops a kernel file left over from an earlier build', () => {
    fs.mkdirSync(path.join(app, 'kernels'));
    fs.writeFileSync(path.join(app, 'kernels', 'removed_upstream.metal'), '');
    run();
    expect(fs.readdirSync(path.join(app, 'kernels'))).not.toContain(
      'removed_upstream.metal',
    );
  });
});

describe("a DerivedSources path as long as an archive build's", () => {
  let longDerived;
  let airDir;

  beforeEach(() => {
    longDerived = path.join(
      tmp,
      ...Array(6).fill(
        'ArchiveIntermediates-PocketPal-IntermediateBuildFilesPath',
      ),
      'DerivedSources',
    );
    airDir = path.join(longDerived, 'rnllama-metal');
    fs.mkdirSync(longDerived, {recursive: true});
    fs.writeFileSync(path.join(tmp, 'bin', 'xargs'), BSD_XARGS, {mode: 0o755});
  });

  it('compiles one .air per kernel at its real path and links them', () => {
    expect(path.join(airDir, 'fa_aux.air').length).toBeGreaterThan(300);
    const {status, calls} = run({env: {DERIVED_FILE_DIR: longDerived}});
    expect(calls.flat().filter(arg => arg.includes('{}'))).toEqual([]);
    expect(
      compiles(calls)
        .map(call => call[call.indexOf('-o') + 1])
        .sort(),
    ).toEqual(
      kernelSet.map(kernel => path.join(airDir, `${kernel}.air`)).sort(),
    );
    expect(calls.filter(call => call[2] === 'metallib')).toEqual([
      [
        '-sdk',
        'iphoneos',
        'metallib',
        ...kernelSet.map(kernel => path.join(airDir, `${kernel}.air`)),
        '-o',
        path.join(longDerived, 'rnllama.metallib'),
      ],
    ]);
    expect(status).toBe(0);
    expect(appMetallibs()).toEqual(['rnllama.metallib']);
  });
});

describe('failures', () => {
  it('fails with the install command when the Metal toolchain is missing', () => {
    const {status, stderr, calls} = run({env: {STUB_NO_METAL: '1'}});
    expect(status).not.toBe(0);
    expect(stderr).toContain('xcodebuild -downloadComponent MetalToolchain');
    expect(compiles(calls)).toEqual([]);
    expect(fs.readdirSync(app)).toEqual([]);
  });

  it('fails without writing a partial library when a kernel does not compile', () => {
    const {status, calls} = run({env: {STUB_FAIL_KERNEL: 'mul_mm'}});
    expect(status).not.toBe(0);
    expect(calls.filter(call => call[2] === 'metallib')).toEqual([]);
    expect(fs.readdirSync(app)).toEqual([]);
  });

  it('fails naming the kernel when a compile exits 0 without its .air', () => {
    const {status, stderr, calls} = run({
      env: {STUB_NO_OUTPUT_KERNEL: 'mul_mm'},
    });
    expect(status).not.toBe(0);
    expect(stderr).toContain('mul_mm.metal produced no');
    expect(calls.filter(call => call[2] === 'metallib')).toEqual([]);
    expect(fs.readdirSync(app)).toEqual([]);
  });

  it('does not count an .air left over from an earlier build', () => {
    fs.mkdirSync(path.join(derived, 'rnllama-metal'));
    fs.writeFileSync(path.join(derived, 'rnllama-metal', 'mul_mm.air'), 'old');
    const {status, calls} = run({env: {STUB_NO_OUTPUT_KERNEL: 'mul_mm'}});
    expect(status).not.toBe(0);
    expect(calls.filter(call => call[2] === 'metallib')).toEqual([]);
    expect(fs.readdirSync(app)).toEqual([]);
  });

  it.each([
    ['no arguments', []],
    ['no kernels', [GGML_SRC]],
  ])('prints usage and exits 64 for %s', (_, args) => {
    const {status, stderr, calls} = run({args});
    expect(stderr).toMatch(/^usage: /);
    expect(calls).toEqual([]);
    expect(status).toBe(64);
  });
});
