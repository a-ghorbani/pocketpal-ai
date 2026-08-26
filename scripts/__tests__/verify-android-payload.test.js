const {execFileSync} = require('child_process');
const {crc32, deflateRawSync} = require('zlib');
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
const ELF64_EHDR_SIZE = 64;
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
  const phoff = ELF64_EHDR_SIZE;
  const dynstrOffset = align8(phoff + phdrs.length);
  const dynsymOffset = align8(dynstrOffset + dynstr.length);
  const shoff = align8(dynsymOffset + dynsym.length);
  const sectionCount = omitDynsym ? 2 : 3;

  const header = Buffer.alloc(ELF64_EHDR_SIZE);
  header.writeUInt32BE(0x7f454c46, 0);
  header.writeUInt8(2, 4); // ELFCLASS64
  header.writeUInt8(1, 5); // ELFDATA2LSB
  header.writeUInt8(1, 6); // EV_CURRENT
  header.writeUInt16LE(3, 16); // ET_DYN
  header.writeUInt16LE(0xb7, 18); // EM_AARCH64
  header.writeUInt32LE(1, 20);
  header.writeBigUInt64LE(BigInt(segments.length > 0 ? phoff : 0), 0x20);
  header.writeBigUInt64LE(BigInt(shoff), 0x28);
  header.writeUInt16LE(ELF64_EHDR_SIZE, 52);
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

/**
 * A zip written by hand, storing every entry uncompressed and controlling the
 * byte offset its data lands on.
 *
 * `zip -q -r -X` cannot be used for this: it deflates even incompressible data,
 * so a rule scoped to stored entries would have an empty subject set against
 * every archive built above and pass having examined nothing. That is the same
 * defect the rule exists to catch, one level up.
 */
function writeStoredArchive(
  name,
  entries,
  {
    align = 16384,
    method = 0,
    corruptLocalSignatureOf = null,
    repeat = null,
  } = {},
) {
  const files = Object.entries(entries);
  if (repeat) {
    files.push([repeat, entries[repeat]]);
  }
  const locals = [];
  const chunks = [];
  let offset = 0;

  for (const [entry, contents] of files) {
    const nameBytes = Buffer.from(entry, 'utf-8');
    const source = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    const body = method === 8 ? deflateRawSync(source) : source;
    let padding = 0;
    if (align) {
      const unpadded = (offset + 30 + nameBytes.length) % align;
      const wanted = unpadded === 0 ? 0 : align - unpadded;
      // An extra field is a 4-byte header plus its payload, so a gap of 1-3
      // bytes has to become a whole page instead.
      padding = wanted === 0 ? 0 : wanted < 4 ? wanted + align : wanted;
    }
    const extra = Buffer.alloc(padding);
    if (padding > 0) {
      extra.writeUInt16LE(0xd935, 0); // the id Android's own aligner uses
      extra.writeUInt16LE(padding - 4, 2);
    }

    const header = Buffer.alloc(30);
    header.writeUInt32LE(
      entry === corruptLocalSignatureOf ? 0x05034b50 : 0x04034b50,
      0,
    );
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(source), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(source.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(extra.length, 28);

    locals.push({nameBytes, body, source, offset, extraLength: extra.length});
    chunks.push(header, nameBytes, extra, body);
    offset += 30 + nameBytes.length + extra.length + body.length;
  }

  const directoryAt = offset;
  for (const local of locals) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(local.source), 16);
    central.writeUInt32LE(local.body.length, 20);
    central.writeUInt32LE(local.source.length, 24);
    central.writeUInt16LE(local.nameBytes.length, 28);
    central.writeUInt32LE(local.offset, 42);
    chunks.push(central, local.nameBytes);
    offset += 46 + local.nameBytes.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(offset - directoryAt, 12);
  end.writeUInt32LE(directoryAt, 16);
  chunks.push(end);

  const archive = path.join(workspace, name);
  fs.writeFileSync(archive, Buffer.concat(chunks));
  return archive;
}

function runScript(scriptPath, args) {
  try {
    return {
      status: 0,
      output: execFileSync('node', [scriptPath, ...args], {encoding: 'utf-8'}),
    };
  } catch (err) {
    return {
      status: err.status,
      output: `${err.stdout || ''}${err.stderr || ''}`,
    };
  }
}

function runGate(args) {
  return runScript(SCRIPT_PATH, args);
}

/**
 * A real APK stores its libraries uncompressed and page-aligned, and the gate
 * now requires both, so the fixtures are built that way. `writeArchive` still
 * exists for the bundle path and for the case about deflation itself.
 */
function gateApk(entries, extraArgs = []) {
  return runGate([
    '--apk',
    writeStoredArchive('app-prod-release.apk', entries),
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

  it('names the llama.rn version the count was read from', () => {
    const {count, pattern} = manifest.abis.find(abi => abi.abi === 'arm64-v8a')
      .requiredSymbols[0].expectedMatchCount;
    const installed = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          'node_modules',
          'llama.rn',
          'package.json',
        ),
        'utf-8',
      ),
    ).version;

    const {status, output} = gateApk(conformingEntries());
    expect(status).toBe(0);
    expect(output).toContain(`${count} .dynsym entries matching "${pattern}"`);
    expect(output).toContain(
      `(declared ${count}), built here against llama.rn ${installed}`,
    );
  });

  /**
   * The version is a fact about the machine running the check, not about the
   * artifact, and `package.json` is arbitrary JSON from a dependency tree. An
   * unvalidated value writes whatever it likes into the evidence.
   */
  it('reads unknown rather than printing an arbitrary version string', () => {
    const isolated = path.join(workspace, 'forged');
    fs.mkdirSync(path.join(isolated, 'node_modules', 'llama.rn'), {
      recursive: true,
    });
    const copy = path.join(isolated, 'verify-android-payload.js');
    fs.copyFileSync(SCRIPT_PATH, copy);
    fs.writeFileSync(
      path.join(isolated, 'node_modules', 'llama.rn', 'package.json'),
      JSON.stringify({version: '0.99.0-totally-different'}),
    );
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
    const {status, output} = runGate([
      '--apk',
      archive,
      '--manifest',
      MANIFEST_PATH,
    ]);
    expect(status).toBe(0);
    expect(output).not.toContain('totally-different');

    const forged = execFileSync(
      'node',
      [copy, '--apk', archive, '--manifest', MANIFEST_PATH],
      {encoding: 'utf-8'},
    );
    expect(forged).toContain('built here against llama.rn unknown');
  });

  it('reads unknown when llama.rn is not installed, and still passes', () => {
    // One level below the workspace root so `__dirname/..` is a directory this
    // test created: os.tmpdir() is /tmp on CI, where a node_modules could exist.
    const isolated = path.join(workspace, 'isolated');
    fs.mkdirSync(isolated);
    const copy = path.join(isolated, 'verify-android-payload.js');
    fs.copyFileSync(SCRIPT_PATH, copy);
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );

    const {status, output} = runScript(copy, [
      '--manifest',
      MANIFEST_PATH,
      '--apk',
      archive,
    ]);
    expect(status).toBe(0);
    expect(output).toContain('llama.rn unknown');
  });

  it('reports the installed tree, not the declared pin, when the two disagree', () => {
    const isolated = path.join(workspace, 'isolated');
    fs.mkdirSync(isolated);
    const copy = path.join(isolated, 'verify-android-payload.js');
    fs.copyFileSync(SCRIPT_PATH, copy);
    fs.mkdirSync(path.join(workspace, 'node_modules', 'llama.rn'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workspace, 'node_modules', 'llama.rn', 'package.json'),
      JSON.stringify({name: 'llama.rn', version: '0.0.0-installed'}),
    );
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({dependencies: {'llama.rn': '0.0.0-declared'}}),
    );
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );

    const {status, output} = runScript(copy, [
      '--manifest',
      MANIFEST_PATH,
      '--apk',
      archive,
    ]);
    expect(status).toBe(0);
    expect(output).toContain('llama.rn 0.0.0-installed');
    expect(output).not.toContain('0.0.0-declared');
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

describe('16 KB page alignment', () => {
  // A tripwire on what the NDK already produces, not a repair — so it has to
  // be shown capable of failing, on the artifact and on the declaration alike.
  it('fails when a required library regresses below the declared alignment', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8.so'] = buildElf([], {
      emptyDynsym: true,
      segments: [
        {type: PT_LOAD, align: 16384},
        {type: PT_LOAD, align: 4096},
      ],
    });
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain(
      'MISALIGNED  lib/arm64-v8a/librnllama_v8.so (PT_LOAD p_align 4096)',
    );
    expect(output).toContain('requires at least 16384 for arm64-v8a');
  });

  // The subject is what the platform loads, not what llama.rn contributes: a
  // scan restricted to requiredLibs would miss the other 52 of 68 libraries.
  it('fails when a library the manifest never names regresses', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/libreanimated.so'] = buildElf([], {
      emptyDynsym: true,
      segments: [{type: PT_LOAD, align: 4096}],
    });
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('MISALIGNED  lib/arm64-v8a/libreanimated.so');
  });

  it('fails on a p_align that is not a power of two', () => {
    const entries = conformingEntries();
    entries['lib/x86_64/librnllama_x86_64.so'] = buildElf([], {
      emptyDynsym: true,
      segments: [{type: PT_LOAD, align: 24576}],
    });
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('p_align 24576');
  });

  it('passes a library aligned more strictly than declared', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8.so'] = buildElf([], {
      emptyDynsym: true,
      segments: [{type: PT_LOAD, align: 65536}],
    });
    const {status, output} = gateApk(entries);
    expect(status).toBe(0);
    expect(output).toContain('segment alignment: 12/12 libraries');
  });

  it('fails a library with no PT_LOAD rather than counting it as aligned', () => {
    const entries = conformingEntries();
    entries['lib/arm64-v8a/librnllama_v8.so'] = buildElf([], {
      emptyDynsym: true,
      segments: [{type: PT_DYNAMIC, align: 8}],
    });
    const {status, output} = gateApk(entries);
    expect(status).toBe(1);
    expect(output).toContain('NO PT_LOAD  lib/arm64-v8a/librnllama_v8.so');
    expect(output).toContain('proven nothing about it');
  });

  it('reports how many libraries it judged, so a scan of none is visible', () => {
    const {status, output} = gateApk(conformingEntries());
    expect(status).toBe(0);
    expect(output).toContain(
      'segment alignment: 12/12 libraries at p_align >= 16384',
    );
    expect(output).toContain(
      'segment alignment: 4/4 libraries at p_align >= 16384',
    );
  });

  it.each([
    ['weakened below the floor', 4096, 'under the 16384-byte floor'],
    ['not a power of two', 24576, 'integer power of two'],
    ['absent', undefined, 'integer power of two'],
  ])(
    'refuses a manifest whose alignment requirement is %s',
    (_label, value, fragment) => {
      const weakened = path.join(workspace, 'weakened-alignment.json');
      const edited = JSON.parse(JSON.stringify(manifest));
      if (value === undefined) {
        delete edited.abis[0].requiredLibAlignment;
      } else {
        edited.abis[0].requiredLibAlignment = value;
      }
      fs.writeFileSync(weakened, JSON.stringify(edited));

      const archive = writeStoredArchive(
        'app-prod-release.apk',
        conformingEntries(),
      );
      const {status, output} = runGate([
        '--apk',
        archive,
        '--manifest',
        weakened,
      ]);
      expect(status).toBe(1);
      expect(output).toContain(fragment);
      // Refused before anything was opened: the artifact is sound, and a
      // manifest that cannot be trusted must not be used to judge one.
      expect(output).not.toContain('artifact:');
    },
  );
});

describe('16 KB zip data offsets', () => {
  // The app ships extractNativeLibs=false, so each library is mapped in place
  // out of the archive and its start offset has to be page-aligned too. A
  // conforming p_align at an unaligned offset still cannot be loaded.
  it('passes an archive whose stored libraries start on a page boundary', () => {
    const {status, output} = runGate([
      '--apk',
      writeStoredArchive('app-prod-release.apk', conformingEntries()),
    ]);
    expect(status).toBe(0);
    // The guard against the subject set being empty: `zip` deflates even
    // incompressible data, so a stored-scoped rule examines nothing unless the
    // fixture is built stored on purpose.
    expect(output).toContain('zip data offset: 12/12 libraries stored');
    expect(output).toContain('zip data offset: 4/4 libraries stored');
    expect(output).not.toContain('zip data offset: 0/0');
  });

  it('fails an archive with conforming segments at unaligned offsets', () => {
    const {status, output} = runGate([
      '--apk',
      writeStoredArchive('app-prod-release.apk', conformingEntries(), {
        align: 0,
      }),
    ]);
    expect(status).toBe(1);
    expect(output).toContain('MISPLACED  lib/arm64-v8a/');
    expect(output).toContain('is not a multiple of 16384');
    // The point of the case: the ELF side is untouched and still passes, so
    // only the offset rule can be what refused it.
    expect(output).toContain('segment alignment: 12/12 libraries');
  });

  it('refuses a `zip`-built archive, whose entries are all deflated', () => {
    // `zip -q -r -X` deflates even incompressible data. That is why the stored
    // writer exists — and why a rule scoped to stored entries would otherwise
    // examine nothing here — but it is also not a loadable artifact.
    const {status, output} = runGate([
      '--apk',
      writeArchive('app-prod-release.apk', conformingEntries()),
    ]);
    expect(status).toBe(1);
    expect(output).toContain('DEFLATED');
  });

  it('does not judge offsets in a bundle, which bundletool repackages', () => {
    const archive = writeStoredArchive(
      'app-prod-release.aab',
      conformingEntries('base/'),
      {align: 0},
    );
    const {status, output} = runGate(['--aab', archive]);
    expect(status).toBe(0);
    expect(output).not.toContain('zip data offset');
  });

  // A whole archive of the wrong bytes fails at entry listing, long before the
  // layout is read, so it says nothing about this reader. This one lists
  // normally under `unzip` and breaks only where the local headers are walked.
  it('fails on an archive whose local header the reader cannot trust', () => {
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
      {corruptLocalSignatureOf: 'lib/arm64-v8a/librnllama.so'},
    );
    const {status, output} = runGate(['--apk', archive]);
    expect(status).toBe(1);
    expect(output).toContain('local header of lib/arm64-v8a/librnllama.so');
    expect(output).toContain('proven nothing about it');
  });

  /**
   * A short read is not an error to `fs.readSync`; it returns fewer bytes and
   * leaves the rest of the buffer alone. Read lengths therefore have to be
   * checked, or an offset past the end of the file is answered from whatever
   * the buffer last held.
   */
  it('fails on a local header offset that points past the end of the file', () => {
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
    const bytes = fs.readFileSync(archive);
    // Repoint the first central directory entry's local header past EOF.
    const at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(bytes.length + 1024, at + 42);
    fs.writeFileSync(archive, bytes);

    const {status, output} = runGate(['--apk', archive]);
    expect(status).toBe(1);
    expect(output).toContain('wanted 30 bytes');
    expect(output).toContain('proven nothing about it');
  });

  /**
   * `unzip` transliterates bytes it cannot render, so its listing and the
   * central directory can name different things. A subject set taken from the
   * listing then skips exactly the entries whose naming is chosen freely.
   */
  it('fails when the entry listing and the archive layout disagree on a name', () => {
    const entries = conformingEntries();
    const awkward = Buffer.concat([
      Buffer.from('lib/arm64-v8a/libevi'),
      Buffer.from([0xbb]),
      Buffer.from('l.so'),
    ]).toString('binary');
    entries[awkward] = PLAIN_ELF;
    const {status, output} = runGate([
      '--apk',
      writeStoredArchive('app-prod-release.apk', entries, {method: 8}),
    ]);
    expect(status).toBe(1);
    expect(output).toContain('in one reading of the archive and not the other');
    expect(output).toContain('libevi');
    expect(output).toContain('proven nothing about it');
  });

  it('fails on an archive whose central directory repeats a name', () => {
    // A repeated name overwrites its earlier entry, so the index holds fewer
    // libraries than the archive declares and its counts read as complete.
    const entries = conformingEntries();
    const archive = writeStoredArchive('app-prod-release.apk', entries, {
      repeat: 'lib/arm64-v8a/librnllama.so',
    });
    const {status, output} = runGate(['--apk', archive]);
    expect(status).toBe(1);
    expect(output).toContain('distinct paths');
    expect(output).toContain('proven nothing about it');
  });

  it('fails when a library is compressed rather than stored', () => {
    // The app maps its libraries out of the APK, so a deflated one cannot be
    // loaded at all — the offset is not the only thing this rule protects.
    const {status, output} = runGate([
      '--apk',
      writeStoredArchive('app-prod-release.apk', conformingEntries(), {
        method: 8,
      }),
    ]);
    expect(status).toBe(1);
    expect(output).toContain('DEFLATED  lib/arm64-v8a/');
    expect(output).toContain('cannot be');
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
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
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
    const archive = writeStoredArchive('app-prod-release.apk', {
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
      JSON.stringify({
        abis: [
          {abi: 'arm64-v8a', requiredLibs: [], requiredLibAlignment: 16384},
        ],
      }),
    );
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
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
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
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
    const archive = writeStoredArchive('app-prod-release.apk', entries);

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
      'a manifest that stops declaring how the libraries are packaged',
      edited => {
        delete edited.nativeLibsMappedInPlace;
      },
      'nativeLibsMappedInPlace',
    ],
    [
      'a manifest claiming the libraries are extracted at install',
      edited => {
        edited.nativeLibsMappedInPlace = false;
      },
      'nativeLibsMappedInPlace',
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
    // The assets moved to a top-level block, so these keys are read by nothing.
    // A key nothing reads is worse than a missing one: it looks like a
    // declaration and demands nothing.
    [
      'an ABI re-declaring the assets at the abandoned location',
      edited => {
        edited.abis[0].requiredAssets = [
          'assets/ggml-hexagon/libggml-htp-v73.so',
        ];
      },
      'a per-ABI requiredAssets',
    ],
    [
      'an ABI whose abandoned asset list is not even a list',
      edited => {
        edited.abis[0].requiredAssets = 'not even a list';
      },
      'a per-ABI requiredAssets',
    ],
    [
      'an ABI re-declaring the abandoned asset machine',
      edited => {
        edited.abis[0].requiredAssetElfMachine = 164;
      },
      'a per-ABI requiredAssetElfMachine',
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

    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
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

    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
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
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
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
            requiredLibAlignment: 16384,
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
    const archive = writeStoredArchive('app-prod-release.apk', entries);
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
    const first = writeStoredArchive('first.apk', conformingEntries());
    const second = writeStoredArchive('second.apk', conformingEntries());
    const {status, output} = runGate(['--apk', first, '--apk', second]);
    expect(status).toBe(1);
    expect(output).toContain('given twice');
  });

  it('fails when the manifest declares no ABIs', () => {
    const emptyManifest = path.join(workspace, 'empty-manifest.json');
    fs.writeFileSync(emptyManifest, JSON.stringify({abis: []}));
    const archive = writeStoredArchive(
      'app-prod-release.apk',
      conformingEntries(),
    );
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
