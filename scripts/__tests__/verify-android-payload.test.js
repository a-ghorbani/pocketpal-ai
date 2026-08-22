const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {readProgramHeaders} = require('../verify-android-payload.js');

const SCRIPT_PATH = path.join(__dirname, '..', 'verify-android-payload.js');
const MANIFEST_PATH = path.join(
  __dirname,
  '..',
  'android-payload-manifest.json',
);
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

const ELF64_SHDR_SIZE = 64;
const ELF64_SYM_SIZE = 24;
const ELF32_PHDR_SIZE = 32;
const ELF64_PHDR_SIZE = 56;
const PT_LOAD = 1;
const PT_DYNAMIC = 2;

/** What the NDK's max-page-size produces, and what the manifest declares. */
const ALIGNED_SEGMENTS = [
  {type: PT_LOAD, align: 16384},
  {type: PT_LOAD, align: 16384},
];

/**
 * A minimal little-endian AArch64 ELF64 shared object carrying nothing but a
 * `.dynsym`, its string table, and a program header table.
 *
 * Synthetic rather than committed binaries: the cases that matter most here —
 * a `.dynsym` that is absent, or present but empty — are artifacts no compiler
 * emits, and a committed `.so` could not be reviewed.
 */
function buildElf(
  symbols,
  {omitDynsym = false, emptyDynsym = false, segments = ALIGNED_SEGMENTS} = {},
) {
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

  const phdrs = Buffer.alloc(segments.length * ELF64_PHDR_SIZE);
  segments.forEach((segment, i) => {
    const at = i * ELF64_PHDR_SIZE;
    phdrs.writeUInt32LE(segment.type, at);
    phdrs.writeBigUInt64LE(BigInt(segment.align), at + 48);
  });

  const align8 = n => n + ((8 - (n % 8)) % 8);
  const phoff = ELF64_SHDR_SIZE;
  const dynstrOffset = align8(phoff + phdrs.length);
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
  header.writeBigUInt64LE(BigInt(segments.length > 0 ? phoff : 0), 0x20);
  header.writeBigUInt64LE(BigInt(shoff), 0x28);
  header.writeUInt16LE(ELF64_SHDR_SIZE, 52);
  header.writeUInt16LE(ELF64_PHDR_SIZE, 0x36);
  header.writeUInt16LE(segments.length, 0x38);
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
  phdrs.copy(out, phoff);
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

/**
 * A DSP library as far as the check is concerned: ELF32, little-endian, and
 * targeting EM_QDSP6, at the 4 KB alignment the shipped ones actually carry.
 * The real ones are 650-730 KB of Hexagon code; only the headers are read, so
 * only the headers are built.
 */
function buildDspStub(
  machine = 164,
  segments = [
    {type: PT_LOAD, align: 4096},
    {type: PT_LOAD, align: 4096},
  ],
) {
  const phoff = 52;
  const out = Buffer.alloc(phoff + segments.length * ELF32_PHDR_SIZE);
  out.writeUInt32BE(0x7f454c46, 0);
  out.writeUInt8(1, 4); // ELFCLASS32
  out.writeUInt8(1, 5); // ELFDATA2LSB
  out.writeUInt8(1, 6);
  out.writeUInt16LE(3, 16); // ET_DYN
  out.writeUInt16LE(machine, 18);
  out.writeUInt32LE(segments.length > 0 ? phoff : 0, 0x1c);
  out.writeUInt16LE(ELF32_PHDR_SIZE, 42);
  out.writeUInt16LE(segments.length, 44);
  segments.forEach((segment, i) => {
    const at = phoff + i * ELF32_PHDR_SIZE;
    out.writeUInt32LE(segment.type, at);
    out.writeUInt32LE(segment.align, at + 28);
  });
  return out;
}

/** Neither of the two shapes the rest of this file builds: 32-bit, MSB. */
function buildBigEndianElf(aligns) {
  const phoff = 52;
  const out = Buffer.alloc(phoff + aligns.length * ELF32_PHDR_SIZE);
  out.writeUInt32BE(0x7f454c46, 0);
  out.writeUInt8(1, 4); // ELFCLASS32
  out.writeUInt8(2, 5); // ELFDATA2MSB
  out.writeUInt8(1, 6);
  out.writeUInt16BE(3, 16); // ET_DYN
  out.writeUInt16BE(20, 18); // EM_PPC
  out.writeUInt32BE(phoff, 0x1c);
  out.writeUInt16BE(ELF32_PHDR_SIZE, 42);
  out.writeUInt16BE(aligns.length, 44);
  aligns.forEach((align, i) => {
    const at = phoff + i * ELF32_PHDR_SIZE;
    out.writeUInt32BE(PT_LOAD, at);
    out.writeUInt32BE(align, at + 28);
  });
  return out;
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
    for (const rule of abi.requiredSymbols) {
      entries[`${prefix}lib/${abi.abi}/${rule.lib}`] = hexagonDynsym(
        rule.expectedMatchCount.count,
      );
    }
  }
  for (const asset of manifest.assets.required) {
    entries[`${prefix}${asset}`] = buildDspStub();
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

describe('the program-header reader', () => {
  // The DSP assets are ELF32 and nothing guarantees the byte order of every
  // object the platform loads, so a reader that copied readDynsym's
  // little-endian 64-bit assertion would throw instead of judging.
  it.each([
    [
      'a 64-bit little-endian object',
      () => buildElf([], {emptyDynsym: true}),
      [16384, 16384],
    ],
    ['a 32-bit little-endian object', () => buildDspStub(), [4096, 4096]],
    ['a 32-bit big-endian object', () => buildBigEndianElf([65536]), [65536]],
  ])('reads the segment alignments of %s', (_label, build, aligns) => {
    const headers = readProgramHeaders(build());
    expect(headers.map(header => header.align)).toEqual(aligns);
    expect(headers.every(header => header.type === PT_LOAD)).toBe(true);
  });

  it('agrees with the builder on an arbitrary segment list', () => {
    const segments = [
      {type: PT_DYNAMIC, align: 8},
      {type: PT_LOAD, align: 4096},
      {type: PT_LOAD, align: 16384},
    ];
    expect(
      readProgramHeaders(buildElf([], {emptyDynsym: true, segments})),
    ).toEqual(
      segments.map(segment => ({type: segment.type, align: segment.align})),
    );
  });

  it('refuses an object with no program header table rather than reading none', () => {
    expect(() =>
      readProgramHeaders(buildElf([], {emptyDynsym: true, segments: []})),
    ).toThrow('program headers are absent');
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

  // Titled for the outcome, not the mechanism: an empty entry trips the
  // zero-byte guard and the ELF length check alike, so this asserts that an
  // unreadable library fails, not which of the two guards caught it.
  it('fails when a required library holds nothing readable', () => {
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
    // Exit code aside, a human scanning the log must not see a pass.
    expect(output).not.toContain('PASS:');
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

  // Every list in the manifest needs a floor. An emptied list is the cheapest
  // edit that unblocks a build, and it degrades silently: the rule simply
  // stops being checked and nothing else covers it.
  it.each([
    [
      'a manifest with no required assets',
      edited => {
        edited.assets.required = [];
      },
      'no required assets',
    ],
    [
      'a manifest whose assets.required is absent',
      edited => {
        delete edited.assets.required;
      },
      'no required assets',
    ],
    [
      'a manifest with no assets block at all',
      edited => {
        delete edited.assets;
      },
      'no assets block',
    ],
    [
      'an accelerator ABI whose only rule examines a different library',
      edited => {
        edited.abis[0].requiredSymbols = [
          {lib: 'librnllama.so', mustExport: ['lm_ggml_backend_reg_count']},
        ];
      },
      'no symbol rule examining it',
    ],
    [
      "an accelerator ABI whose only rule examines the accelerator's JNI wrapper",
      edited => {
        edited.abis[0].requiredSymbols = [
          {
            lib: 'librnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl.so',
            mustExport: ['Java_com_rnllama_RNLlama_nativeSetLoadedLibrary'],
          },
        ];
      },
      'no symbol rule examining it',
    ],
    [
      'a manifest declaring assets with no machine to check them against',
      edited => {
        delete edited.assets.elfMachine;
      },
      'no elfMachine',
    ],
    [
      'a manifest that never says which ABIs can load the assets',
      edited => {
        delete edited.assets.usableByAbis;
      },
      'no usableByAbis',
    ],
    [
      'a manifest claiming the assets are usable by an ABI it does not declare',
      edited => {
        edited.assets.usableByAbis.push('armeabi-v7a');
      },
      'does not declare as an ABI',
    ],
    [
      'an accelerator ABI with no symbol rule, even when another ABI has one',
      edited => {
        edited.abis[0].requiredSymbols = [];
        edited.abis[1].requiredSymbols = [
          {
            lib: 'librnllama_x86_64.so',
            mustExport: ['lm_ggml_backend_reg_count'],
          },
        ];
      },
      'no symbol rule',
    ],
  ])('fails on %s', (_label, weaken, fragment) => {
    const weakened = path.join(workspace, 'weakened-abi.json');
    const edited = JSON.parse(JSON.stringify(manifest));
    weaken(edited);
    fs.writeFileSync(weakened, JSON.stringify(edited));

    const archive = writeArchive('app-prod-release.apk', conformingEntries());
    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain(fragment);
  });

  it('reports the assets row once per artifact, not once per declared ABI', () => {
    // Android packages assets/ once, so a row per ABI would claim the same
    // four entries were checked twice and invite the ABI-scoping that does not
    // exist. The summary claims assets were checked; this is where it shows.
    const {output} = gateApk(conformingEntries());
    const rows = output.split('\n').filter(line => /^\s*assets: /.test(line));
    expect(rows).toEqual(['  assets: 4/4 present']);
  });

  // usableByAbis is compared against the shipped lib/ trees, never against the
  // manifest that declares it — an equality between two readings of the same
  // document holds whatever either one says.
  it('reports which ABIs can load the DSP assets, read from the lib trees', () => {
    const {status, output} = gateApk(conformingEntries());
    expect(status).toBe(0);
    expect(output).toContain('can load the DSP assets: yes (declared yes)');
    expect(output).toContain('can load the DSP assets: no (declared no)');
  });

  it('fails when an accelerator variant appears under an undeclared-usable ABI', () => {
    const entries = conformingEntries();
    entries['lib/x86_64/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'] =
      PLAIN_ELF;
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain(
      'ships accelerator libraries for arm64-v8a, x86_64',
    );
    expect(output).toContain('usable by arm64-v8a');
  });

  it('fails when an ABI declared able to load the assets carries no accelerator', () => {
    const entries = conformingEntries();
    delete entries[
      'lib/arm64-v8a/librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so'
    ];
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('ships accelerator libraries for no ABI');
  });

  it('refuses an asset scope the packager cannot deliver', () => {
    const weakened = path.join(workspace, 'abi-scoped-assets.json');
    const edited = JSON.parse(JSON.stringify(manifest));
    edited.assets.scope = 'abi';
    fs.writeFileSync(weakened, JSON.stringify(edited));

    const archive = writeArchive('app-prod-release.apk', conformingEntries());
    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('only "artifact" is deliverable');
  });

  // Relocating the assets out of the ABIs leaves the global accelerator guard
  // reading a field nothing else in the block touches, which is exactly how a
  // guard gets quietly lost in a restructure.
  it('still refuses a manifest with populated assets but no accelerator ABI', () => {
    const weakened = path.join(workspace, 'assets-without-accelerator.json');
    const edited = JSON.parse(JSON.stringify(manifest));
    edited.abis[0].requiredLibs = edited.abis[0].requiredLibs.filter(
      lib => !/_hexagon/.test(lib),
    );
    edited.abis[0].requiredSymbols = [
      {lib: 'librnllama.so', mustExport: ['lm_ggml_backend_reg_count']},
    ];
    fs.writeFileSync(weakened, JSON.stringify(edited));

    expect(edited.assets.required.length).toBeGreaterThan(0);
    const archive = writeArchive('app-prod-release.apk', conformingEntries());
    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('no accelerator library');
  });

  // A new fail-closed assertion with no test is how the previous holes became
  // possible: it works today, and nothing holds it there.
  it('fails on an ABI tree the manifest never declared', () => {
    const entries = conformingEntries();
    entries['lib/armeabi-v7a/librnllama.so'] = PLAIN_ELF;
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('UNDECLARED  lib/armeabi-v7a/');
    expect(output).toContain('which the manifest does not declare');
  });

  it('reports the ABI trees it found, so the enumeration is visible', () => {
    const {output} = gateApk(conformingEntries());
    expect(output).toContain('ABIs in the artifact: arm64-v8a, x86_64');
  });

  it('enumerates ABI trees in a bundle too, under its base/ prefix', () => {
    const entries = conformingEntries('base/');
    entries['base/lib/armeabi-v7a/librnllama.so'] = PLAIN_ELF;
    const archive = writeArchive('app-prod-release.aab', entries);
    const {status, output} = runGate(['--aab', archive]);
    expect(status).toBe(1);
    expect(output).toContain('UNDECLARED  base/lib/armeabi-v7a/');
  });

  it('fails when a DSP asset is present but is not a DSP object', () => {
    const entries = conformingEntries();
    entries['assets/ggml-hexagon/libggml-htp-v73.so'] = buildDspStub(183); // EM_AARCH64
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('WRONG MACHINE');
    expect(output).toContain('is not a DSP library');
  });

  it('fails when a DSP asset is not an ELF object at all', () => {
    const entries = conformingEntries();
    entries['assets/ggml-hexagon/libggml-htp-v73.so'] = Buffer.alloc(64, 0x41);
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('proven nothing about it');
  });

  it('refuses a manifest declaring no accelerator ABI at all', () => {
    // Otherwise every accelerator floor is satisfied vacuously, and the ABI
    // enumeration compares only against what the manifest names.
    const weakened = path.join(workspace, 'no-accelerator-abi.json');
    fs.writeFileSync(
      weakened,
      JSON.stringify({
        abis: [
          {
            abi: 'armeabi-v7a',
            requiredLibs: ['librnllama.so', 'librnllama_jni.so'],
            requiredSymbols: [
              {lib: 'librnllama.so', mustExport: ['lm_ggml_backend_reg_count']},
            ],
          },
        ],
      }),
    );
    const entries = {
      'lib/armeabi-v7a/librnllama.so': buildElf([
        {name: 'lm_ggml_backend_reg_count', defined: true},
      ]),
      'lib/armeabi-v7a/librnllama_jni.so': PLAIN_ELF,
    };
    const archive = writeArchive('app-prod-release.apk', entries);
    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('no accelerator library');
  });

  it('refuses a wrappers-only manifest before it can yield an empty allowlist', () => {
    const weakened = path.join(workspace, 'wrappers-only.json');
    const edited = JSON.parse(JSON.stringify(manifest));
    for (const abi of edited.abis) {
      abi.requiredLibs = abi.requiredLibs.filter(lib =>
        lib.startsWith('librnllama_jni'),
      );
    }
    fs.writeFileSync(weakened, JSON.stringify(edited));

    // Stripping the libraries also strips the accelerator, so this is refused
    // by the accelerator floor. variantsFromManifest keeps its own empty-list
    // guard as a backstop: an empty value would make gradle pass no
    // -DRNLLAMA_ANDROID_VARIANTS, and CMake reads that as "build everything".
    const {status, output} = runGate([
      '--print-variants',
      '--manifest',
      weakened,
    ]);
    expect(status).toBe(1);
    expect(output).toContain('no accelerator library');
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
