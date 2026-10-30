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

const WHISPER_CPP = path.join(ROOT, 'node_modules', 'whisper.rn', 'cpp');
const WHISPER_METAL = path.join(WHISPER_CPP, 'ggml-metal');
const WHISPER_KERNELS = path.join(WHISPER_METAL, 'kernels');

const parseKernelSet = (metalDir, macro) =>
  [
    ...(fs
      .readFileSync(path.join(metalDir, 'ggml-metal-device.m'), 'utf-8')
      .match(new RegExp(`^#define ${macro}((?:.*\\\\\\n)+.*)`, 'm')) || [
      '',
      '',
    ])[1].matchAll(/X\(\s*\w+\s*,\s*(\w+)\s*\)/g),
  ].map(match => match[1]);

const kernelSet = parseKernelSet(GGML_METAL, 'GGML_METAL_LIBS');
const whisperKernelSet = parseKernelSet(WHISPER_METAL, 'WSP_GGML_METAL_LIBS');

const tensorKernels = [
  ...fs
    .readFileSync(path.join(GGML_METAL, 'CMakeLists.txt'), 'utf-8')
    .matchAll(/Compiling kernels\/(\w+)\.metal \(tensor API\)/g),
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
  [ "$arg" = -DGGML_METAL_HAS_TENSOR ] && [ -n "\${STUB_FAIL_TENSOR:-}" ] && { echo "error: stub" >&2; exit 1; }
  prev=$arg
done
[ "\${out%/rnllama-metal/\${STUB_NO_OUTPUT_AIR:-none}}" != "$out" ] && exit 0
echo "$tool" > "$out"
[ "\${out%/rnllama-metal/\${STUB_FAIL_AFTER_OUTPUT_AIR:-none}}" != "$out" ] && exit 1
exit 0
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

  it("finds whisper.rn's kernel set", () => {
    expect(whisperKernelSet.length).toBeGreaterThan(0);
  });

  it("finds upstream's tensor API kernels, which the script builds", () => {
    expect(tensorKernels).toEqual(['mul_mm', 'fa_f16']);
  });
});

describe.each([
  ['iphoneos', ''],
  ['iphonesimulator', '-simulator'],
])('the %s build', (platform, suffix) => {
  const compile = (target, defines, kernel, air) => [
    '-sdk',
    platform,
    'metal',
    '-O3',
    `-mtargetos=${target}${suffix}`,
    ...defines,
    '-I',
    GGML_METAL,
    '-I',
    GGML_SRC,
    '-c',
    path.join(KERNELS, `${kernel}.metal`),
    '-o',
    path.join(derived, 'rnllama-metal', air),
  ];

  it('compiles each kernel for iOS 18 with bf16, the tensor API kernels again for iOS 26, and nothing else', () => {
    const {status, calls} = run({platform});
    expect(status).toBe(0);
    expect(sorted(compiles(calls))).toEqual(
      sorted([
        ...kernelSet.map(kernel =>
          compile(
            'ios18.0',
            ['-DGGML_METAL_HAS_BF16'],
            kernel,
            `${kernel}.air`,
          ),
        ),
        ...tensorKernels.map(kernel =>
          compile(
            'ios26.0',
            ['-DGGML_METAL_HAS_TENSOR', '-DGGML_METAL_HAS_BF16'],
            kernel,
            `tensor/${kernel}.air`,
          ),
        ),
      ]),
    );
  });

  it('links rnllama.metallib and ggml-tensor.metallib, after every compile', () => {
    const {calls} = run({platform});
    const links = calls.filter(call => call[2] === 'metallib');
    expect(calls.slice(-2).map(call => call[2])).toEqual([
      'metallib',
      'metallib',
    ]);
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
      [
        '-sdk',
        platform,
        'metallib',
        ...tensorKernels.map(kernel =>
          path.join(derived, 'rnllama-metal', 'tensor', `${kernel}.air`),
        ),
        '-o',
        path.join(derived, 'ggml-tensor.metallib'),
      ],
    ]);
  });
});

describe('the app bundle it writes', () => {
  it('holds the two libraries and nothing else', () => {
    expect(run().status).toBe(0);
    expect(fs.readdirSync(app).sort()).toEqual([
      'ggml-tensor.metallib',
      'rnllama.metallib',
    ]);
    for (const lib of ['rnllama.metallib', 'ggml-tensor.metallib']) {
      expect(fs.readFileSync(path.join(app, lib), 'utf-8')).toBe('metallib\n');
    }
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
    const tensorAirs = tensorKernels.map(kernel =>
      path.join(airDir, 'tensor', `${kernel}.air`),
    );
    expect(
      compiles(calls)
        .map(call => call[call.indexOf('-o') + 1])
        .sort(),
    ).toEqual(
      [
        ...kernelSet.map(kernel => path.join(airDir, `${kernel}.air`)),
        ...tensorAirs,
      ].sort(),
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
      [
        '-sdk',
        'iphoneos',
        'metallib',
        ...tensorAirs,
        '-o',
        path.join(longDerived, 'ggml-tensor.metallib'),
      ],
    ]);
    expect(status).toBe(0);
    expect(appMetallibs().sort()).toEqual([
      'ggml-tensor.metallib',
      'rnllama.metallib',
    ]);
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

  it('fails without writing either library when a tensor API kernel does not compile', () => {
    const {status, stderr, calls} = run({env: {STUB_FAIL_TENSOR: '1'}});
    expect(status).not.toBe(0);
    expect(stderr).toContain('the tensor API kernels need Xcode 26.6 or later');
    expect(calls.filter(call => call[2] === 'metallib')).toEqual([]);
    expect(fs.readdirSync(app)).toEqual([]);
  });

  it.each([
    ['mul_mm.air', 'mul_mm.metal produced no '],
    ['tensor/mul_mm.air', 'mul_mm.metal produced no '],
  ])(
    'fails naming the kernel when a compile exits 0 without %s',
    (air, message) => {
      const {status, stderr, calls} = run({env: {STUB_NO_OUTPUT_AIR: air}});
      expect(status).not.toBe(0);
      expect(stderr).toContain(
        `${message}${path.join(derived, 'rnllama-metal', air)}`,
      );
      expect(stderr.includes('need Xcode 26.6 or later')).toBe(
        air.startsWith('tensor/'),
      );
      expect(calls.filter(call => call[2] === 'metallib')).toEqual([]);
      expect(fs.readdirSync(app)).toEqual([]);
    },
  );

  it('fails without writing either library when a compile fails after writing its .air', () => {
    const {status, calls} = run({
      env: {STUB_FAIL_AFTER_OUTPUT_AIR: 'tensor/fa_f16.air'},
    });
    expect(status).not.toBe(0);
    expect(calls.filter(call => call[2] === 'metallib')).toEqual([]);
    expect(fs.readdirSync(app)).toEqual([]);
  });

  it.each(['mul_mm.air', 'tensor/mul_mm.air'])(
    'does not count a %s left over from an earlier build',
    air => {
      const stale = path.join(derived, 'rnllama-metal', air);
      fs.mkdirSync(path.dirname(stale), {recursive: true});
      fs.writeFileSync(stale, 'old');
      const {status, calls} = run({env: {STUB_NO_OUTPUT_AIR: air}});
      expect(status).not.toBe(0);
      expect(calls.filter(call => call[2] === 'metallib')).toEqual([]);
      expect(fs.readdirSync(app)).toEqual([]);
    },
  );

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

describe('whisper mode', () => {
  const whisperArgs = ['--whisper', WHISPER_CPP, ...whisperKernelSet];
  const runWhisper = ({platform, env = {}} = {}) =>
    run({
      platform,
      args: whisperArgs,
      env: {KERNELS_DIR: WHISPER_KERNELS, ...env},
    });
  const whisperAir = kernel =>
    path.join(derived, 'whisper-metal', `${kernel}.air`);

  describe.each([
    ['iphoneos', '-mtargetos=ios18.0'],
    ['iphonesimulator', '-mtargetos=ios18.0-simulator'],
  ])('the %s build', (platform, target) => {
    it("compiles each of whisper's kernels for iOS 18 with its own bf16 macro", () => {
      const {status, calls} = runWhisper({platform});
      expect(status).toBe(0);
      expect(sorted(compiles(calls))).toEqual(
        sorted(
          whisperKernelSet.map(kernel => [
            '-sdk',
            platform,
            'metal',
            '-O3',
            target,
            '-DWSP_GGML_METAL_HAS_BF16',
            '-I',
            WHISPER_METAL,
            '-I',
            WHISPER_CPP,
            '-c',
            path.join(WHISPER_KERNELS, `${kernel}.metal`),
            '-o',
            whisperAir(kernel),
          ]),
        ),
      );
    });

    it('links every kernel into one default.metallib, after every compile', () => {
      const {calls} = runWhisper({platform});
      expect(calls[calls.length - 1][2]).toBe('metallib');
      expect(calls.filter(call => call[2] === 'metallib')).toEqual([
        [
          '-sdk',
          platform,
          'metallib',
          ...whisperKernelSet.map(whisperAir),
          '-o',
          path.join(derived, 'default.metallib'),
        ],
      ]);
    });
  });

  it('writes default.metallib and nothing else into the bundle', () => {
    expect(runWhisper().status).toBe(0);
    expect(fs.readdirSync(app)).toEqual(['default.metallib']);
    expect(fs.readFileSync(path.join(app, 'default.metallib'), 'utf-8')).toBe(
      'metallib\n',
    );
  });

  it("leaves llama.rn's libraries as the llama run wrote them", () => {
    expect(run().status).toBe(0);
    const llamaFiles = fs.readdirSync(app, {recursive: true}).sort();
    const snapshot = Object.fromEntries(
      llamaFiles
        .filter(name => fs.statSync(path.join(app, name)).isFile())
        .map(name => [name, fs.readFileSync(path.join(app, name))]),
    );

    expect(runWhisper().status).toBe(0);

    expect(appMetallibs().sort()).toEqual([
      'default.metallib',
      'ggml-tensor.metallib',
      'rnllama.metallib',
    ]);
    expect(fs.readdirSync(app, {recursive: true}).sort()).toEqual(
      [...llamaFiles, 'default.metallib'].sort(),
    );
    for (const [name, content] of Object.entries(snapshot)) {
      expect(fs.readFileSync(path.join(app, name)).equals(content)).toBe(true);
    }
  });

  it('fails without writing a library when a kernel does not compile', () => {
    const {status, calls} = runWhisper({env: {STUB_FAIL_KERNEL: 'fa'}});
    expect(status).not.toBe(0);
    expect(calls.filter(call => call[2] === 'metallib')).toEqual([]);
    expect(fs.readdirSync(app)).toEqual([]);
  });

  it.each([
    ['no directory', ['--whisper']],
    ['no kernels', ['--whisper', WHISPER_CPP]],
  ])('prints usage and exits 64 for %s', (_, args) => {
    const {status, stderr, calls} = run({args});
    expect(stderr).toMatch(/^usage: /);
    expect(calls).toEqual([]);
    expect(status).toBe(64);
  });
});
