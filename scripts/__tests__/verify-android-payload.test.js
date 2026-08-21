const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'verify-android-payload.js');
const MANIFEST_PATH = path.join(
  __dirname,
  '..',
  'android-payload-manifest.json',
);
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

const ELF64_SHDR_SIZE = 64;
const ELF64_SYM_SIZE = 24;

/**
 * A minimal little-endian AArch64 ELF64 shared object carrying nothing but a
 * `.dynsym` and its string table.
 *
 * Synthetic rather than committed binaries: the cases that matter most here —
 * a `.dynsym` that is absent, or present but empty — are artifacts no compiler
 * emits, and a committed `.so` could not be reviewed.
 */
function buildElf(symbols, {omitDynsym = false, emptyDynsym = false} = {}) {
  let dynstr = Buffer.from([0]);
  const nameOffsets = [];
  for (const symbol of symbols) {
    nameOffsets.push(dynstr.length);
    dynstr = Buffer.concat([
      dynstr,
      Buffer.from(symbol.name, 'utf-8'),
      Buffer.from([0]),
    ]);
  }

  const entries = emptyDynsym ? 1 : symbols.length + 1;
  const dynsym = Buffer.alloc(entries * ELF64_SYM_SIZE);
  if (!emptyDynsym) {
    symbols.forEach((symbol, i) => {
      const at = (i + 1) * ELF64_SYM_SIZE;
      dynsym.writeUInt32LE(nameOffsets[i], at);
      dynsym.writeUInt8(0x12, at + 4); // STB_GLOBAL | STT_FUNC
      dynsym.writeUInt16LE(symbol.defined ? 1 : 0, at + 6);
    });
  }

  const align8 = n => n + ((8 - (n % 8)) % 8);
  const dynstrOffset = ELF64_SHDR_SIZE;
  const dynsymOffset = align8(dynstrOffset + dynstr.length);
  const shoff = align8(dynsymOffset + dynsym.length);
  const sectionCount = omitDynsym ? 2 : 3;

  const header = Buffer.alloc(ELF64_SHDR_SIZE);
  header.writeUInt32BE(0x7f454c46, 0);
  header.writeUInt8(2, 4); // ELFCLASS64
  header.writeUInt8(1, 5); // ELFDATA2LSB
  header.writeUInt8(1, 6); // EV_CURRENT
  header.writeUInt16LE(3, 16); // ET_DYN
  header.writeUInt16LE(0xb7, 18); // EM_AARCH64
  header.writeUInt32LE(1, 20);
  header.writeBigUInt64LE(BigInt(shoff), 0x28);
  header.writeUInt16LE(ELF64_SHDR_SIZE, 52);
  header.writeUInt16LE(ELF64_SHDR_SIZE, 0x3a);
  header.writeUInt16LE(sectionCount, 0x3c);

  const sections = Buffer.alloc(sectionCount * ELF64_SHDR_SIZE);
  const writeSection = (index, {type, offset, size, link = 0, entsize = 0}) => {
    const at = index * ELF64_SHDR_SIZE;
    sections.writeUInt32LE(type, at + 4);
    sections.writeBigUInt64LE(BigInt(offset), at + 24);
    sections.writeBigUInt64LE(BigInt(size), at + 32);
    sections.writeUInt32LE(link, at + 40);
    sections.writeBigUInt64LE(BigInt(entsize), at + 56);
  };
  writeSection(1, {type: 3, offset: dynstrOffset, size: dynstr.length}); // SHT_STRTAB
  if (!omitDynsym) {
    writeSection(2, {
      type: 11, // SHT_DYNSYM
      offset: dynsymOffset,
      size: dynsym.length,
      link: 1,
      entsize: ELF64_SYM_SIZE,
    });
  }

  const out = Buffer.alloc(shoff + sections.length);
  header.copy(out, 0);
  dynstr.copy(out, dynstrOffset);
  dynsym.copy(out, dynsymOffset);
  sections.copy(out, shoff);
  return out;
}

const REQUIRED_HEXAGON_SYMBOLS = [
  'lm_ggml_backend_hexagon_reg',
  'lm_ggml_backend_is_hexagon',
];

/**
 * A `.dynsym` with `matchCount` entries containing "hexagon", of which the two
 * required ones are defined unless `withRequired` is false, plus non-matching
 * noise so the pattern count is not simply the symbol count.
 */
function hexagonDynsym(matchCount, {withRequired = true} = {}) {
  const symbols = [];
  if (withRequired) {
    for (const name of REQUIRED_HEXAGON_SYMBOLS) {
      symbols.push({name, defined: true});
    }
  }
  while (symbols.length < matchCount) {
    symbols.push({
      name: `lm_ggml_hexagon_session_${symbols.length}`,
      defined: true,
    });
  }
  symbols.push({name: 'lm_ggml_backend_reg_count', defined: true});
  symbols.push({name: 'malloc', defined: false});
  return buildElf(symbols);
}

const PLAIN_ELF = buildElf([
  {name: 'lm_ggml_backend_reg_count', defined: true},
  {name: 'malloc', defined: false},
]);

/** The entry map of an artifact that satisfies the committed manifest. */
function conformingEntries(prefix = '') {
  const entries = {};
  for (const abi of manifest.abis) {
    for (const lib of abi.requiredLibs) {
      entries[`${prefix}lib/${abi.abi}/${lib}`] = PLAIN_ELF;
    }
    for (const asset of abi.requiredAssets) {
      entries[`${prefix}${asset}`] = Buffer.from('dsp');
    }
    for (const rule of abi.requiredSymbols) {
      entries[`${prefix}lib/${abi.abi}/${rule.lib}`] = hexagonDynsym(
        rule.expectedMatchCount.count,
      );
    }
  }
  return entries;
}

let workspace;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-android-payload-'));
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

function runGate(args) {
  try {
    return {
      status: 0,
      output: execFileSync('node', [SCRIPT_PATH, ...args], {encoding: 'utf-8'}),
    };
  } catch (err) {
    return {
      status: err.status,
      output: `${err.stdout || ''}${err.stderr || ''}`,
    };
  }
}

function gateApk(entries, extraArgs = []) {
  return runGate([
    '--apk',
    writeArchive('app-prod-release.apk', entries),
    ...extraArgs,
  ]);
}

describe('the variant allowlist', () => {
  // The allowlist gradle compiles and the payload the gate demands must come
  // from the same declaration, or a build can satisfy one and not the other.
  it('is derived from the manifest, bare variant names, wrappers dropped', () => {
    const {status, output} = runGate(['--print-variants']);
    expect(status).toBe(0);
    expect(output.trim()).toBe(
      'rnllama,rnllama_v8,rnllama_v8_2,rnllama_v8_2_dotprod,rnllama_v8_2_dotprod_i8mm,rnllama_v8_2_dotprod_i8mm_hexagon_opencl,rnllama_x86_64',
    );
  });

  it('needs no artifact, so it is safe to call before anything is built', () => {
    expect(runGate(['--print-variants']).status).toBe(0);
  });
});

describe('a conforming artifact', () => {
  it('passes', () => {
    const {status, output} = gateApk(conformingEntries());
    expect(status).toBe(0);
    expect(output).toContain('PASS');
    expect(output).toContain('extra rnllama libraries: none');
  });

  it('passes as an app bundle, whose entries sit under base/', () => {
    const archive = writeArchive(
      'app-prod-release.aab',
      conformingEntries('base/'),
    );
    const {status, output} = runGate(['--aab', archive]);
    expect(status).toBe(0);
    expect(output).toContain('PASS');
  });

  it('fails as an app bundle if checked without the base/ prefix', () => {
    const archive = writeArchive('app-prod-release.aab', conformingEntries());
    expect(runGate(['--aab', archive]).status).toBe(1);
  });

  // The bundle path must judge the library it found, not merely find one. A
  // prefix that matched nothing would report the same "PASS" as a sound build.
  it('fails as an app bundle whose backend library is the broken one', () => {
    const entries = conformingEntries('base/');
    entries[
      'base/lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'
    ] = hexagonDynsym(0, {withRequired: false});
    const archive = writeArchive('app-prod-release.aab', entries);
    const {status, output} = runGate(['--aab', archive]);
    expect(status).toBe(1);
    expect(output).toContain(
      'base/lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so',
    );
    expect(output).toContain('does not export');
  });

  it('writes the same report to --report', () => {
    const reportPath = path.join(workspace, 'payload-report.txt');
    const {output} = gateApk(conformingEntries(), ['--report', reportPath]);
    expect(fs.readFileSync(reportPath, 'utf-8')).toBe(output);
  });
});

describe('the Hexagon backend', () => {
  it('fails when the required symbols are absent, naming both', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      hexagonDynsym(0, {
        withRequired: false,
      });
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    for (const name of REQUIRED_HEXAGON_SYMBOLS) {
      expect(output).toContain(`MISSING  ${name}`);
    }
    expect(output).toContain('does not export');
    expect(output).toContain('issues/858');
  });

  it('fails when a required symbol is only an undefined import', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      buildElf([
        {name: 'lm_ggml_backend_hexagon_reg', defined: false},
        {name: 'lm_ggml_backend_is_hexagon', defined: true},
      ]);
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('MISSING  lm_ggml_backend_hexagon_reg');
  });

  it('fails on a changed symbol count, and says to re-declare it', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      hexagonDynsym(18);
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('18 .dynsym entries matching "hexagon"');
    expect(output).toContain('re-declare');
    expect(output).toContain('expectedMatchCount as 18');
  });
});

describe('the declared payload', () => {
  it('fails when a required library is missing, naming the entry', () => {
    const entries = conformingEntries();
    delete entries['lib/arm64-v8a/librnllama_v8_2_dotprod.so'];
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain(
      'MISSING  lib/arm64-v8a/librnllama_v8_2_dotprod.so',
    );
    expect(output).toContain('ORG_GRADLE_PROJECT_rnllamaVariants');
  });

  it('fails when a DSP asset is missing', () => {
    const entries = conformingEntries();
    delete entries['assets/ggml-hexagon/libggml-htp-v73.so'];
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('MISSING  assets/ggml-hexagon/libggml-htp-v73.so');
  });

  it('permits and reports extra variants, so forcing prebuilts still passes', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_i8mm.so'] = PLAIN_ELF;
    entries['lib/arm64-v8a/librnllama_jni_v8_2_i8mm.so'] = PLAIN_ELF;
    const {status, output} = gateApk(entries);
    expect(status).toBe(0);
    expect(output).toContain(
      'extra rnllama libraries: librnllama_jni_v8_2_i8mm.so, librnllama_v8_2_i8mm.so',
    );
  });
});

describe('a check that cannot run', () => {
  // Every case below must fail. A gate that passes because it read nothing is
  // worse than no gate: it reports the artifact as sound on no evidence.
  it('fails when the artifact is not a readable archive', () => {
    const archive = path.join(workspace, 'truncated.apk');
    fs.writeFileSync(archive, Buffer.from('PK truncated'));
    const {status, output} = runGate(['--apk', archive]);
    expect(status).toBe(1);
    expect(output).toContain('proven nothing about it');
  });

  it('fails when a required library extracts as zero bytes', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      Buffer.alloc(0);
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('UNREADABLE');
    expect(output).toContain('proven nothing about it');
  });

  it('fails when the library has no .dynsym section', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      buildElf([{name: 'lm_ggml_backend_hexagon_reg', defined: true}], {
        omitDynsym: true,
      });
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('no .dynsym section');
  });

  it('fails when .dynsym is present but empty', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      buildElf([], {
        emptyDynsym: true,
      });
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('.dynsym is empty');
  });

  it('fails when the library is not an ELF object at all', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      Buffer.alloc(256, 0x41);
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('not an ELF object');
  });

  it('fails when asked to check nothing', () => {
    expect(runGate([]).status).toBe(1);
  });

  it('refuses --print-variants alongside an artifact rather than skipping the check', () => {
    const archive = writeArchive('app-prod-release.apk', conformingEntries());
    const {status, output} = runGate(['--print-variants', '--apk', archive]);
    expect(status).toBe(1);
    expect(output).toContain('does not check an artifact');
  });

  it('fails when the artifact is not there at all', () => {
    const {status, output} = runGate([
      '--apk',
      path.join(workspace, 'never-built.apk'),
    ]);
    expect(status).toBe(1);
    expect(output).toContain('proven nothing about it');
  });

  it('fails when the artifact is a readable archive holding nothing', () => {
    const archive = writeArchive('app-prod-release.apk', {
      'META-INF/placeholder': Buffer.from('x'),
    });
    expect(runGate(['--apk', archive]).status).toBe(1);
  });

  it('fails when the library has had its section headers stripped', () => {
    const stripped = Buffer.from(PLAIN_ELF);
    stripped.writeBigUInt64LE(0n, 0x28); // e_shoff
    stripped.writeUInt16LE(0, 0x3c); // e_shnum
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      stripped;
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('section headers are absent');
  });

  // The report is the evidence the check ran. Failing to write it while
  // reporting success would leave a pass nobody can audit.
  it('fails when it cannot write the report, even if the artifact is sound', () => {
    const {status, output} = gateApk(conformingEntries(), [
      '--report',
      path.join(workspace, 'no-such-directory', 'payload-report.txt'),
    ]);
    expect(status).toBe(1);
    expect(output).toContain('FAIL');
  });

  it('fails when the manifest declares no libraries for an ABI', () => {
    const weakened = path.join(workspace, 'no-libs.json');
    fs.writeFileSync(
      weakened,
      JSON.stringify({abis: [{abi: 'arm64-v8a', requiredLibs: []}]}),
    );
    const archive = writeArchive('app-prod-release.apk', conformingEntries());
    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('declares no required libraries');
  });

  it('fails when the manifest declares no symbol rules', () => {
    const weakened = path.join(workspace, 'no-symbol-rules.json');
    const stripped = JSON.parse(JSON.stringify(manifest));
    for (const abi of stripped.abis) {
      abi.requiredSymbols = [];
    }
    fs.writeFileSync(weakened, JSON.stringify(stripped));
    const archive = writeArchive('app-prod-release.apk', conformingEntries());
    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('declares no symbol rules');
  });

  // The regression that motivated this check satisfied every library and asset
  // rule; the symbol rule was the only thing that caught it. A rule that names
  // a library but asserts nothing about it therefore restores the incident with
  // CI green, and counting rules rather than reading them would not notice.
  it.each([
    [
      'a rule that asserts nothing',
      rule => {
        delete rule.mustExport;
        delete rule.expectedMatchCount;
      },
    ],
    [
      'a rule whose mustExport has been emptied',
      rule => {
        rule.mustExport = [];
        delete rule.expectedMatchCount;
      },
    ],
    ['a rule naming no library', rule => delete rule.lib],
    // count: 0 does not merely assert nothing, it asserts the backend is
    // ABSENT — so the incident build satisfies it exactly.
    [
      'a rule whose only demand is a count of zero',
      rule => {
        rule.mustExport = [];
        rule.expectedMatchCount = {pattern: 'hexagon', count: 0};
      },
    ],
    [
      'a rule whose expectedMatchCount has no pattern',
      rule => {
        rule.mustExport = [];
        rule.expectedMatchCount = {count: 16};
      },
    ],
    [
      'a rule whose expectedMatchCount is an empty object',
      rule => {
        rule.mustExport = [];
        rule.expectedMatchCount = {};
      },
    ],
  ])('fails on %s', (_label, weaken) => {
    const weakened = path.join(workspace, 'weakened.json');
    const edited = JSON.parse(JSON.stringify(manifest));
    weaken(edited.abis[0].requiredSymbols[0]);
    fs.writeFileSync(weakened, JSON.stringify(edited));

    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      hexagonDynsym(0, {withRequired: false});
    const archive = writeArchive('app-prod-release.apk', entries);

    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('its backend would not be checked');
  });

  it('refuses a manifest that yields an empty variant allowlist', () => {
    const weakened = path.join(workspace, 'wrappers-only.json');
    const edited = JSON.parse(JSON.stringify(manifest));
    for (const abi of edited.abis) {
      abi.requiredLibs = abi.requiredLibs.filter(lib =>
        lib.startsWith('librnllama_jni'),
      );
    }
    fs.writeFileSync(weakened, JSON.stringify(edited));

    // An empty allowlist would be exported as ORG_GRADLE_PROJECT_rnllamaVariants=
    // and the build-log assertion would then grep for a bare prefix.
    const {status, output} = runGate([
      '--print-variants',
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('empty variant allowlist');
  });

  it('refuses a repeated --apk rather than checking only the last one', () => {
    const first = writeArchive('first.apk', conformingEntries());
    const second = writeArchive('second.apk', conformingEntries());
    const {status, output} = runGate(['--apk', first, '--apk', second]);
    expect(status).toBe(1);
    expect(output).toContain('given twice');
  });

  it('fails when the manifest declares no ABIs', () => {
    const emptyManifest = path.join(workspace, 'empty-manifest.json');
    fs.writeFileSync(emptyManifest, JSON.stringify({abis: []}));
    const archive = writeArchive('app-prod-release.apk', conformingEntries());
    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      emptyManifest,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('declares no ABIs');
  });
});
