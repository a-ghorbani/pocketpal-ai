#!/usr/bin/env node
/**
 * verify-android-payload.js — checks a built Android APK/AAB against
 * scripts/android-payload-manifest.json before it can be published.
 *
 * Usage:
 *   node scripts/verify-android-payload.js --apk <path> [--aab <path>] [--report <path>]
 *   node scripts/verify-android-payload.js --print-variants
 *
 * `--print-variants` reads only the manifest and writes the gradle variant
 * allowlist to stdout, so it is safe inside `$(...)`.
 *
 * Two things here are deliberate and would otherwise look arbitrary:
 *
 * - Backend presence is decided from `.dynsym`, never from `strings` or file
 *   size. `strings` false-positives on unrelated `codec_*_ht` symbols, and two
 *   builds that differ in whether the Hexagon backend is compiled in have
 *   identical `opencl` string counts. `.dynsym` also survives stripping.
 * - The ELF reader is in-process rather than a call out to `readelf`/`llvm-nm`.
 *   macOS ships no `readelf`, and the NDK's `llvm-nm` sits at a host-specific
 *   path, so shelling out would make the check unrunnable on exactly the
 *   machines that need to run it locally.
 *
 * Exit 0 when every declared requirement holds, non-zero otherwise —
 * including when the check could not read what it was asked to judge.
 *
 * Pattern mirrors scripts/verify-fonts.js.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_MANIFEST = path.join(__dirname, 'android-payload-manifest.json');
const ISSUE_URL = 'https://github.com/a-ghorbani/pocketpal-ai/issues/858';

const SHT_DYNSYM = 11;
const SHN_UNDEF = 0;
const PT_LOAD = 1;
const ELF64_SYM_SIZE = 24;
const ELF64_SHDR_SIZE = 64;
const ELF32_PHDR_SIZE = 32;
const ELF64_PHDR_SIZE = 56;
const ELF32_EHDR_SIZE = 52;
const ELF64_EHDR_SIZE = 64;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const LOCAL_HEADER_SIZE = 30;

// The page size a 16 KB-page device maps at. Two separate properties are held
// to it — the linker's `p_align` (`-Wl,-z,max-page-size=16384`) and the zip
// data offset the packager placed the library at — and a library needs both to
// load; neither on its own is the Android 15 requirement. The manifest declares
// the number per ABI; this is only the floor it cannot undercut, because a
// lowered number is the cheapest edit that unblocks a failing build.
const MIN_LIB_ALIGNMENT = 16384;

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-android-payload.js --apk <path> [--aab <path>] [--report <path>]',
    '  node scripts/verify-android-payload.js --print-variants',
    '',
    'At least one of --apk / --aab is required unless --print-variants is given.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--print-variants':
        args.printVariants = true;
        break;
      case '--apk':
      case '--aab':
      case '--manifest':
      case '--report': {
        const value = argv[++i];
        if (!value || value.startsWith('--')) {
          throw new Error(`${flag} needs a path.\n\n${usage()}`);
        }
        // Refused rather than last-one-wins: a repeated flag would otherwise
        // check one artifact while reporting on the whole invocation.
        if (args[flag.slice(2)]) {
          throw new Error(`${flag} was given twice.\n\n${usage()}`);
        }
        args[flag.slice(2)] = value;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${flag}\n\n${usage()}`);
    }
  }
  if (!args.printVariants && !args.apk && !args.aab) {
    throw new Error(`Nothing to check.\n\n${usage()}`);
  }
  // Refused rather than ignored: --print-variants returns before reading any
  // artifact, so accepting both would silently pass whatever it was given.
  if (args.printVariants && (args.apk || args.aab)) {
    throw new Error(
      `--print-variants does not check an artifact; do not pass it with --apk/--aab.\n\n${usage()}`,
    );
  }
  args.manifest = args.manifest || DEFAULT_MANIFEST;
  return args;
}

/**
 * A symbol rule has to demand that something is *present*. The shape a
 * weakening edit takes is emptying `mustExport` during a dependency bump
 * instead of re-declaring it, and the library itself is still there, so no
 * other rule notices. `expectedMatchCount` only counts as a demand when it
 * asks for a positive number of matches: `count: 0` asserts the backend is
 * absent, which is both self-contradictory next to `mustExport` and exactly
 * the state this check exists to reject.
 */
function assertRuleDemandsSomething(rule, manifestPath) {
  const named = rule.lib || '(unnamed library)';
  const refuse = why => {
    throw new Error(
      `${manifestPath} declares a symbol rule for ${named} that ${why}, so its backend would not be checked.`,
    );
  };

  if (!rule.lib) {
    refuse('names no library');
  }
  const mustExport = rule.mustExport || [];
  if (!Array.isArray(mustExport)) {
    refuse('has a mustExport that is not a list');
  }

  const count = rule.expectedMatchCount;
  if (count !== undefined) {
    if (
      typeof count !== 'object' ||
      count === null ||
      typeof count.pattern !== 'string' ||
      count.pattern.length === 0 ||
      !Number.isInteger(count.count) ||
      count.count < 0
    ) {
      refuse('has a malformed expectedMatchCount');
    }
  }

  const demandsPresence = mustExport.length > 0 || (count && count.count > 0);
  if (!demandsPresence) {
    refuse('asserts nothing');
  }
}

/**
 * A library that carries the Hexagon backend itself, as opposed to the JNI
 * wrapper beside it — whose name also contains "_hexagon", but which is a thin
 * shim exporting stable Java_* entry points and none of the backend symbols.
 * Mirrors the name convention llama.rn's own CMake uses to decide which
 * variant gets the backend; were upstream to rename it, the ladder-coverage
 * test fails first.
 */
function isAcceleratorLib(lib) {
  return /_hexagon/.test(lib) && !/^librnllama_jni/.test(lib);
}

function refuseAbi(abi, manifestPath, why) {
  throw new Error(
    `${manifestPath} declares ${why} for ${abi.abi || '(unnamed ABI)'}.`,
  );
}

/** Shape and the one floor every ABI has, accelerator or not. */
function assertAbiStructure(abi, manifestPath) {
  if (
    !abi.abi ||
    !Array.isArray(abi.requiredLibs) ||
    abi.requiredLibs.length === 0
  ) {
    refuseAbi(abi, manifestPath, 'no required libraries');
  }
  if (
    abi.requiredSymbols !== undefined &&
    !Array.isArray(abi.requiredSymbols)
  ) {
    refuseAbi(abi, manifestPath, 'a requiredSymbols that is not a list');
  }
  // The assets moved to a top-level block, and a key nothing reads is worse
  // than a missing one: an editor working from the old shape declares assets,
  // is never told they are ignored, and gets a green gate.
  for (const abandoned of ['requiredAssets', 'requiredAssetElfMachine']) {
    if (abi[abandoned] !== undefined) {
      refuseAbi(
        abi,
        manifestPath,
        `a per-ABI ${abandoned}, which nothing reads; the DSP assets are declared once in the top-level "assets" block`,
      );
    }
  }
  for (const rule of abi.requiredSymbols || []) {
    assertRuleDemandsSomething(rule, manifestPath);
  }
}

/**
 * An ABI that carries an accelerator variant has to demand the things that
 * make it work. The list degrades silently: emptying it is the cheapest edit
 * that unblocks a build, the rule simply stops being checked, and nothing else
 * in the manifest covers it.
 *
 * Conditional because an ABI without an accelerator legitimately declares
 * none.
 */
function assertAcceleratorFloors(abi, manifestPath) {
  if (!abi.requiredLibs.some(lib => /_hexagon/.test(lib))) {
    return;
  }
  // Not merely "a rule", but a rule that looks at the accelerator library
  // itself. Two near-misses both pass every other floor and both accept an
  // artifact with no backend: a rule pointing at librnllama.so, and a rule
  // pointing at the accelerator's own JNI wrapper.
  if (
    !(abi.requiredSymbols || []).some(rule => isAcceleratorLib(rule.lib || ''))
  ) {
    refuseAbi(
      abi,
      manifestPath,
      'an accelerator library but no symbol rule examining it',
    );
  }
}

function isPowerOfTwo(value) {
  if (!Number.isInteger(value) || value < 1) {
    return false;
  }
  let remaining = value;
  while (remaining % 2 === 0) {
    remaining /= 2;
  }
  return remaining === 1;
}

function assertAlignmentFloor(abi, manifestPath) {
  const declared = abi.requiredLibAlignment;
  if (!isPowerOfTwo(declared)) {
    refuseAbi(
      abi,
      manifestPath,
      'no requiredLibAlignment that is an integer power of two',
    );
  }
  if (declared < MIN_LIB_ALIGNMENT) {
    refuseAbi(
      abi,
      manifestPath,
      `a requiredLibAlignment of ${declared}, under the ${MIN_LIB_ALIGNMENT}-byte floor`,
    );
  }
}

/**
 * The DSP libraries are extracted as a set at runtime and the backend is
 * disabled outright if any one is missing, so a compiled-in accelerator with
 * no assets is dead on the device.
 *
 * Unconditional because `loadManifest` refuses a manifest with no accelerator
 * ABI before reaching here; these floors would otherwise need that condition.
 */
function assertAssetFloors(manifest, manifestPath) {
  const refuse = why => {
    throw new Error(`${manifestPath} declares ${why}.`);
  };
  const assets = manifest.assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) {
    refuse('no assets block, so no DSP payload would be checked');
  }
  // One legal value, so this cannot fail on a correct manifest. It exists so a
  // maintainer reaching for "abi" is told why no packaging mechanism delivers
  // it, rather than shipping a scope nothing implements.
  if (assets.scope !== 'artifact') {
    refuse(
      `an asset scope of ${JSON.stringify(assets.scope)}; only "artifact" is deliverable, because Android packages assets/ once per artifact and not per ABI`,
    );
  }
  if (!Array.isArray(assets.required) || assets.required.length === 0) {
    refuse('an accelerator library but no required assets');
  }
  if (!Number.isInteger(assets.elfMachine)) {
    refuse('required assets but no elfMachine to check them against');
  }
  if (!Array.isArray(assets.usableByAbis)) {
    refuse(
      'required assets but no usableByAbis to say which ABIs can load them',
    );
  }
  // An ABI nobody declared is never enumerated against the artifact, so naming
  // one here would be a claim the check silently never reaches.
  const declaredAbis = new Set(manifest.abis.map(abi => abi.abi));
  const unknown = assets.usableByAbis.filter(abi => !declaredAbis.has(abi));
  if (unknown.length > 0) {
    refuse(
      `the assets usable by ${unknown.join(', ')}, which it does not declare as an ABI, so nothing would check that claim`,
    );
  }
}

function loadManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Could not read the manifest ${manifestPath}: ${err.message}`,
    );
  }
  // A manifest that declares nothing would let every artifact pass, which is
  // the failure mode this check exists to prevent.
  if (!Array.isArray(manifest.abis) || manifest.abis.length === 0) {
    throw new Error(
      `${manifestPath} declares no ABIs, so it would pass any artifact.`,
    );
  }
  for (const abi of manifest.abis) {
    assertAbiStructure(abi, manifestPath);
  }
  // Between the two per-ABI passes so the broadest weakening gets the broadest
  // message instead of being reported as one ABI's problem.
  const symbolRules = manifest.abis.reduce(
    (total, abi) => total + (abi.requiredSymbols || []).length,
    0,
  );
  if (symbolRules === 0) {
    throw new Error(
      `${manifestPath} declares no symbol rules, so no backend would be checked.`,
    );
  }
  // Every accelerator floor below is conditional on an ABI declaring an
  // accelerator library, so a manifest declaring none would satisfy all of
  // them vacuously — and the ABI enumeration only compares against what the
  // manifest names, so a tree carrying no ladder at all would pass.
  if (!manifest.abis.some(abi => abi.requiredLibs.some(isAcceleratorLib))) {
    throw new Error(
      `${manifestPath} declares no accelerator library for any ABI, so no backend would be checked.`,
    );
  }
  // Only `true` is accepted. The app maps its libraries in place; flipping
  // this to say otherwise would silently retire both the offset rule and the
  // stored requirement, which is the cheapest edit that unblocks a repacked
  // artifact.
  if (manifest.nativeLibsMappedInPlace !== true) {
    throw new Error(
      `${manifestPath} must declare nativeLibsMappedInPlace: true; the app ships extractNativeLibs=false, so every native library is mapped out of the APK rather than extracted.`,
    );
  }
  assertAssetFloors(manifest, manifestPath);
  for (const abi of manifest.abis) {
    assertAcceleratorFloors(abi, manifestPath);
  }
  // Last, so that a manifest weakened in some other way is still refused with
  // the message that names what it weakened.
  for (const abi of manifest.abis) {
    assertAlignmentFloor(abi, manifestPath);
  }
  return manifest;
}

function variantsFromManifest(manifest, manifestPath) {
  const variants = [];
  for (const abi of manifest.abis) {
    for (const lib of abi.requiredLibs) {
      if (lib.startsWith('librnllama_jni')) {
        continue;
      }
      const variant = lib.replace(/^lib/, '').replace(/\.so$/, '');
      if (!variants.includes(variant)) {
        variants.push(variant);
      }
    }
  }
  // An empty allowlist silently un-narrows the build: gradle skips passing
  // -DRNLLAMA_ANDROID_VARIANTS at all for an empty value, and CMake reads the
  // resulting empty variable as "every variant enabled"
  // (cmake/rnllama-build-options.cmake). The build-log assertion would also
  // fail, since gradle prints nothing either — this just fails earlier, and
  // says which of the two it is.
  if (variants.length === 0) {
    throw new Error(
      `${manifestPath} yields an empty variant allowlist; every required library is a JNI wrapper.`,
    );
  }
  return variants;
}

function listZipEntries(archive) {
  let out;
  try {
    out = execFileSync('unzip', ['-Z1', archive], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`could not list ${archive}: ${err.message.trim()}`);
  }
  const entries = out.split('\n').filter(Boolean);
  if (entries.length === 0) {
    throw new Error(`${archive} contains no entries`);
  }
  return entries;
}

function readZipEntry(archive, entry) {
  let buf;
  try {
    buf = execFileSync('unzip', ['-p', archive, entry], {
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`could not extract ${entry}: ${err.message.trim()}`);
  }
  if (buf.length === 0) {
    throw new Error(`${entry} extracted as zero bytes`);
  }
  return buf;
}

/**
 * The ELF machine an object targets. Shares the header layout between ELF32
 * and ELF64 — `e_machine` sits at the same offset in both — so this works for
 * the DSP libraries, which are ELF32, as well as the arm64 libraries.
 */
function readElfMachine(buf) {
  if (buf.length < 20) {
    throw new Error('file is too short to be an ELF object');
  }
  if (buf.readUInt32BE(0) !== 0x7f454c46) {
    throw new Error('file is not an ELF object');
  }
  const littleEndian = buf[5] === 1;
  return littleEndian ? buf.readUInt16LE(18) : buf.readUInt16BE(18);
}

/**
 * Where each entry's bytes actually start, and whether they are stored or
 * deflated. Read from the archive's own headers rather than from `unzip`,
 * which prints the *central* directory's extra-field length: the alignment
 * padding lives in the **local** header, and the two differ. In a release APK
 * the central value is 0 for every library while the local one is whatever it
 * took to reach the next page boundary, so the difference is the whole field.
 */
function readZipIndex(archive) {
  const fd = fs.openSync(archive, 'r');
  // A short read is not an error to `fs.readSync`; it simply returns fewer
  // bytes and leaves the rest of the buffer as it found it. Discarding the
  // count means an offset past the end of the file is read as whatever the
  // buffer held last, which for a reused buffer is the previous entry.
  const readExactly = (buffer, length, position) => {
    const got = fs.readSync(fd, buffer, 0, length, position);
    if (got !== length) {
      throw new Error(
        `wanted ${length} bytes at ${position} but the archive gave ${got}`,
      );
    }
  };
  try {
    const size = fs.fstatSync(fd).size;
    const tailLength = Math.min(size, 0xffff + 22);
    const tail = Buffer.alloc(tailLength);
    readExactly(tail, tailLength, size - tailLength);

    let eocd = -1;
    for (let at = tail.length - EOCD_SIZE; at >= 0; at--) {
      if (tail.readUInt32LE(at) === EOCD_SIGNATURE) {
        eocd = at;
        break;
      }
    }
    if (eocd === -1) {
      throw new Error('no end-of-central-directory record');
    }
    const count = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryAt = tail.readUInt32LE(eocd + 16);
    // Guessing past a ZIP64 marker would silently read the wrong offsets, so
    // it fails instead; no artifact this gate judges is near those limits.
    if (
      count === 0xffff ||
      directorySize === 0xffffffff ||
      directoryAt === 0xffffffff
    ) {
      throw new Error(
        'the archive uses ZIP64, which this reader does not parse',
      );
    }

    const directory = Buffer.alloc(directorySize);
    readExactly(directory, directorySize, directoryAt);

    const index = new Map();
    let at = 0;
    for (let i = 0; i < count; i++) {
      if (directory.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
        throw new Error('a central directory entry is malformed');
      }
      const method = directory.readUInt16LE(at + 10);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      const localAt = directory.readUInt32LE(at + 42);
      const name = directory.toString('utf-8', at + 46, at + 46 + nameLength);

      const local = Buffer.alloc(LOCAL_HEADER_SIZE);
      readExactly(local, LOCAL_HEADER_SIZE, localAt);
      if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) {
        throw new Error(`the local header of ${name} is malformed`);
      }
      index.set(name, {
        stored: method === 0,
        dataOffset:
          localAt +
          LOCAL_HEADER_SIZE +
          local.readUInt16LE(26) +
          local.readUInt16LE(28),
      });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return index;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Every program header, in file order. Both ELF classes and both byte orders,
 * like `readElfMachine` and unlike `readDynsym`: the subjects include the
 * ELF32 DSP objects, and a reader that assumed ELF64-LE would throw on them
 * rather than judge them.
 */
function readProgramHeaders(buf) {
  if (buf.length < ELF32_EHDR_SIZE) {
    throw new Error('file is too short to be an ELF object');
  }
  if (buf.readUInt32BE(0) !== 0x7f454c46) {
    throw new Error('file is not an ELF object');
  }
  if (buf[4] !== 1 && buf[4] !== 2) {
    throw new Error(`ELF class ${buf[4]} is neither 32-bit nor 64-bit`);
  }
  if (buf[5] !== 1 && buf[5] !== 2) {
    throw new Error(`ELF data encoding ${buf[5]} is neither LSB nor MSB`);
  }
  const elf64 = buf[4] === 2;
  const littleEndian = buf[5] === 1;
  if (elf64 && buf.length < ELF64_EHDR_SIZE) {
    throw new Error('file is too short to be an ELF object');
  }

  const u16 = at =>
    littleEndian ? buf.readUInt16LE(at) : buf.readUInt16BE(at);
  const u32 = at =>
    littleEndian ? buf.readUInt32LE(at) : buf.readUInt32BE(at);
  const u64 = at =>
    Number(littleEndian ? buf.readBigUInt64LE(at) : buf.readBigUInt64BE(at));

  const phoff = elf64 ? u64(0x20) : u32(0x1c);
  const phentsize = u16(elf64 ? 0x36 : 42);
  const phnum = u16(elf64 ? 0x38 : 44);
  const phdrSize = elf64 ? ELF64_PHDR_SIZE : ELF32_PHDR_SIZE;
  if (phoff === 0 || phnum === 0) {
    throw new Error('ELF program headers are absent');
  }
  if (phentsize < phdrSize || phoff + phnum * phentsize > buf.length) {
    throw new Error('ELF program header table is malformed or truncated');
  }

  const headers = [];
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    headers.push({
      type: u32(at),
      align: elf64 ? u64(at + 48) : u32(at + 28),
    });
  }
  return headers;
}

/**
 * Bounded by the string table, not by the file: a `.dynstr` region containing
 * no NUL would otherwise make every lookup scan to EOF, turning a malformed
 * artifact into an O(symbols x filesize) scan rather than a prompt failure.
 */
function readCString(buf, offset, limit) {
  if (offset < 0 || offset >= limit || limit > buf.length) {
    throw new Error('a .dynsym name points outside its string table');
  }
  const end = buf.indexOf(0, offset);
  if (end === -1 || end >= limit) {
    throw new Error('a .dynsym name is not terminated inside its string table');
  }
  return buf.toString('utf-8', offset, end);
}

/**
 * Every `.dynsym` entry, in file order, skipping the reserved null entry —
 * the same set `llvm-nm -D` prints, which is what the manifest counts were
 * calibrated against.
 */
function readDynsym(buf) {
  if (buf.length < ELF64_EHDR_SIZE) {
    throw new Error('file is too short to be an ELF object');
  }
  if (buf.readUInt32BE(0) !== 0x7f454c46) {
    throw new Error('file is not an ELF object');
  }
  if (buf[4] !== 2 || buf[5] !== 1) {
    throw new Error('file is not a little-endian 64-bit ELF object');
  }

  const shoff = Number(buf.readBigUInt64LE(0x28));
  const shentsize = buf.readUInt16LE(0x3a);
  const shnum = buf.readUInt16LE(0x3c);
  if (shoff === 0 || shnum === 0) {
    throw new Error('ELF section headers are absent');
  }
  if (shentsize < ELF64_SHDR_SIZE || shoff + shnum * shentsize > buf.length) {
    throw new Error('ELF section header table is malformed or truncated');
  }

  const sections = [];
  for (let i = 0; i < shnum; i++) {
    const at = shoff + i * shentsize;
    sections.push({
      type: buf.readUInt32LE(at + 4),
      offset: Number(buf.readBigUInt64LE(at + 24)),
      size: Number(buf.readBigUInt64LE(at + 32)),
      link: buf.readUInt32LE(at + 40),
      entsize: Number(buf.readBigUInt64LE(at + 56)),
    });
  }

  const dynsym = sections.find(section => section.type === SHT_DYNSYM);
  if (!dynsym) {
    throw new Error('the file has no .dynsym section');
  }
  if (dynsym.entsize !== ELF64_SYM_SIZE) {
    throw new Error(`.dynsym has an unexpected entry size (${dynsym.entsize})`);
  }
  if (dynsym.offset + dynsym.size > buf.length) {
    throw new Error('.dynsym runs past the end of the file');
  }
  const strtab = sections[dynsym.link];
  if (!strtab) {
    throw new Error(
      '.dynsym points at a string table the file does not contain',
    );
  }

  const count = Math.floor(dynsym.size / dynsym.entsize);
  if (count < 2) {
    throw new Error('.dynsym is empty');
  }

  const symbols = [];
  for (let i = 1; i < count; i++) {
    const at = dynsym.offset + i * dynsym.entsize;
    symbols.push({
      name: readCString(
        buf,
        strtab.offset + buf.readUInt32LE(at),
        strtab.offset + strtab.size,
      ),
      defined: buf.readUInt16LE(at + 6) !== SHN_UNDEF,
    });
  }
  return symbols;
}

function installedLlamaRnVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', 'node_modules', 'llama.rn', 'package.json'),
        'utf-8',
      ),
    );
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function checkSymbolRule({rule, archive, artifactName, entry, report, fail}) {
  let symbols;
  try {
    symbols = readDynsym(readZipEntry(archive, entry));
  } catch (err) {
    report.push(`    ${rule.lib}: UNREADABLE — ${err.message}`);
    fail(
      [
        `could not read the exported symbols of ${entry} in ${artifactName}: ${err.message}.`,
        'The payload check could not run, so it reports failure rather than success —',
        'a check that cannot read the artifact has proven nothing about it.',
      ].join('\n      '),
    );
    return;
  }

  report.push(`    ${rule.lib}: ${symbols.length} .dynsym entries`);

  const missing = (rule.mustExport || []).filter(
    name => !symbols.some(symbol => symbol.name === name && symbol.defined),
  );
  for (const name of rule.mustExport || []) {
    report.push(
      `      ${missing.includes(name) ? 'MISSING' : 'present'}  ${name}`,
    );
  }
  if (missing.length > 0) {
    fail(
      [
        `${entry} in ${artifactName} does not export ${missing.join(', ')}.`,
        'The Hexagon (NPU) backend was not compiled into this build, so Snapdragon devices',
        'will fall back to the CPU. Point HEXAGON_SDK_ROOT and HEXAGON_TOOLS_ROOT at an SDK',
        'containing ipc/fastrpc/remote/ship/android_aarch64/libcdsprpc.so and rebuild.',
        `Background: ${ISSUE_URL}`,
      ].join('\n      '),
    );
  }

  const expected = rule.expectedMatchCount;
  if (!expected) {
    return;
  }
  const pattern = expected.pattern.toLowerCase();
  const matched = symbols.filter(symbol =>
    symbol.name.toLowerCase().includes(pattern),
  ).length;
  report.push(
    `      ${matched} .dynsym entries matching "${expected.pattern}" (declared ${expected.count}), llama.rn ${installedLlamaRnVersion()}`,
  );
  if (matched !== expected.count && missing.length === 0) {
    fail(
      [
        `${entry} in ${artifactName} has ${matched} .dynsym entries matching "${expected.pattern}";`,
        `scripts/android-payload-manifest.json declares ${expected.count}.`,
        'The required symbols are all present, so the backend is compiled in — this is a drift',
        'tripwire, not a breakage. If the change is expected (a llama.rn upgrade, say), re-declare',
        `expectedMatchCount as ${matched} in the same pull request so the diff is reviewed.`,
      ].join('\n      '),
    );
  }
}

/**
 * The DSP assets, once per artifact: Android packages `assets/` once, not per
 * ABI, so checking them inside the ABI loop would report the same four entries
 * as many times as there are declared ABIs.
 */
function checkAssets({
  archive,
  prefix,
  entries,
  assets,
  artifactName,
  report,
  fail,
}) {
  const missing = assets.required.filter(
    asset => !entries.has(`${prefix}${asset}`),
  );
  report.push(
    `  assets: ${assets.required.length - missing.length}/${assets.required.length} present`,
  );

  // Presence by filename is not enough: a file of the right name that is not a
  // DSP library leaves the backend as dead on the device as a missing one, and
  // would report PASS.
  for (const asset of assets.required.filter(
    candidate => !missing.includes(candidate),
  )) {
    const entry = `${prefix}${asset}`;
    let machine;
    try {
      machine = readElfMachine(readZipEntry(archive, entry));
    } catch (err) {
      report.push(`    UNREADABLE  ${entry} — ${err.message}`);
      fail(
        [
          `could not read ${entry} in ${artifactName}: ${err.message}.`,
          'The payload check could not run, so it reports failure rather than success —',
          'a check that cannot read the artifact has proven nothing about it.',
        ].join('\n      '),
      );
      continue;
    }
    if (machine !== assets.elfMachine) {
      report.push(
        `    WRONG MACHINE  ${entry} (e_machine ${machine}, expected ${assets.elfMachine})`,
      );
      fail(
        [
          `${entry} in ${artifactName} is not a DSP library: its ELF e_machine is ${machine},`,
          `and the manifest requires ${assets.elfMachine}.`,
          'A file of the right name that the DSP cannot load disables the Hexagon backend just as',
          'surely as a missing one. Check that llama.rn shipped real bin/arm64-v8a payloads.',
        ].join('\n      '),
      );
    }
  }

  for (const asset of missing) {
    report.push(`    MISSING  ${prefix}${asset}`);
    fail(
      [
        `${artifactName} is missing ${prefix}${asset}.`,
        'All four DSP libraries are required, not only the one a given device uses:',
        'RNLlama.java extracts them as a set and disables the Hexagon backend entirely',
        'if any one is absent. They are synced into the artifact from',
        "node_modules/llama.rn/bin/arm64-v8a by llama.rn's syncRNLlamaHtpAssets task —",
        'check that the dependency installed completely.',
      ].join('\n      '),
    );
  }
}

/**
 * Every shipped library of one ABI, not only the required ones: alignment is a
 * property of what the platform loads, and the libraries this manifest does
 * not name are loaded by the same linker on the same device.
 *
 * Two properties, not one. `p_align` is what the linker wrote into the object;
 * the **zip data offset** is where that object sits in the archive. The app
 * ships `extractNativeLibs=false`, so bionic maps each `.so` in place out of
 * the APK and both have to be 16 KB-aligned — an artifact with conforming
 * segments at unaligned offsets cannot `dlopen` on a 16 KB-page device, and
 * asserting only the first certifies exactly that artifact.
 *
 * The DSP assets are deliberately outside the subject set. They are ELF32
 * Hexagon objects at `p_align` 4096, loaded by the DSP rather than by Android,
 * so one floor spanning both would fail the gate on a correct artifact.
 */
function checkAlignment({
  archive,
  prefix,
  entries,
  abi,
  artifactName,
  zipIndex,
  report,
  fail,
}) {
  const libs = [...entries]
    .filter(
      entry =>
        entry.startsWith(`${prefix}lib/${abi.abi}/`) && entry.endsWith('.so'),
    )
    .sort();
  const declared = abi.requiredLibAlignment;
  const judged = libs.map(entry => {
    try {
      const loads = readProgramHeaders(readZipEntry(archive, entry)).filter(
        header => header.type === PT_LOAD,
      );
      const offending = loads.filter(
        header => header.align < declared || !isPowerOfTwo(header.align),
      );
      return {
        entry,
        loads: loads.length,
        worst:
          offending.length > 0
            ? Math.min(...offending.map(header => header.align))
            : null,
      };
    } catch (err) {
      return {entry, unreadable: err.message};
    }
  });

  const conforming = judged.filter(
    lib => !lib.unreadable && lib.loads > 0 && lib.worst === null,
  ).length;
  report.push(
    `    segment alignment: ${conforming}/${libs.length} libraries at p_align >= ${declared}`,
  );

  for (const lib of judged) {
    if (lib.unreadable) {
      report.push(`      UNREADABLE  ${lib.entry} — ${lib.unreadable}`);
      fail(
        [
          `could not read the program headers of ${lib.entry} in ${artifactName}: ${lib.unreadable}.`,
          'The payload check could not run, so it reports failure rather than success —',
          'a check that cannot read the artifact has proven nothing about it.',
        ].join('\n      '),
      );
      continue;
    }
    // An object with nothing to load proves nothing about its alignment, so it
    // is an instrument failure rather than a pass.
    if (lib.loads === 0) {
      report.push(`      NO PT_LOAD  ${lib.entry}`);
      fail(
        [
          `${lib.entry} in ${artifactName} has no PT_LOAD segment, so its alignment could not be judged.`,
          'The payload check could not run, so it reports failure rather than success —',
          'a check that cannot read the artifact has proven nothing about it.',
        ].join('\n      '),
      );
      continue;
    }
    if (lib.worst !== null) {
      report.push(
        `      MISALIGNED  ${lib.entry} (PT_LOAD p_align ${lib.worst})`,
      );
      fail(
        [
          `${lib.entry} in ${artifactName} has a PT_LOAD segment at p_align ${lib.worst};`,
          `scripts/android-payload-manifest.json requires at least ${declared} for ${abi.abi}.`,
          'Android 15+ refuses to load a shared library whose segments are not page-aligned on a',
          '16 KB-page device. The NDK produces this alignment by default, so a library below it',
          'came from a toolchain or linker flag that overrode it — fix the build, not the manifest.',
        ].join('\n      '),
      );
    }
  }

  if (!zipIndex) {
    return;
  }

  // Every library, not only the stored ones. The app maps its libraries out of
  // the APK, so a deflated entry is not a library checked under some other
  // rule — it is one the loader cannot map at all, on any device. Skipping it
  // here would excuse the more serious fault of the two.
  // Both readings come from the same central directory — `unzip -Z1` lists it
  // and `readZipIndex` walks it — so an entry can only be absent here if the
  // directory itself is malformed, which the reader refuses outright.
  const indexed = libs.filter(entry => zipIndex.has(entry));
  const deflated = indexed.filter(entry => !zipIndex.get(entry).stored);
  const misplaced = indexed.filter(
    entry =>
      zipIndex.get(entry).stored &&
      zipIndex.get(entry).dataOffset % declared !== 0,
  );
  report.push(
    `    zip data offset: ${indexed.length - deflated.length - misplaced.length}/${indexed.length} libraries stored at a multiple of ${declared}`,
  );
  for (const entry of deflated) {
    report.push(`      DEFLATED  ${entry}`);
    fail(
      [
        `${entry} in ${artifactName} is compressed inside the archive.`,
        'scripts/android-payload-manifest.json declares nativeLibsMappedInPlace, so the platform maps',
        'this library straight out of the APK and never extracts it — a compressed entry cannot be',
        'mapped and will fail to load on every device. Either the artifact was repacked after the',
        'build, or packaging changed to useLegacyPackaging and the manifest has to say so.',
      ].join('\n      '),
    );
  }
  for (const entry of misplaced) {
    const offset = zipIndex.get(entry).dataOffset;
    report.push(`      MISPLACED  ${entry} (data offset ${offset})`);
    fail(
      [
        `${entry} in ${artifactName} begins at byte ${offset}, which is not a multiple of ${declared}.`,
        'The app sets extractNativeLibs=false, so this library is mapped in place out of the APK and',
        'a 16 KB-page device cannot load it from an unaligned offset — the segment alignment above',
        'says nothing about this. Alignment padding is inserted by the Android Gradle Plugin when it',
        'packages the archive, so a failure here means the artifact was repacked or zipaligned away.',
      ].join('\n      '),
    );
  }
}

function checkArtifact({archive, kind, manifest, report, failures}) {
  const artifactName = path.basename(archive);
  const prefix = kind === 'aab' ? 'base/' : '';
  const fail = message => failures.push(`FAIL: ${message}`);

  report.push(`artifact: ${archive} (${kind})`);

  let entries;
  try {
    entries = new Set(listZipEntries(archive));
  } catch (err) {
    report.push(`  UNREADABLE — ${err.message}`);
    fail(
      [
        `${err.message}.`,
        'The payload check could not run, so it reports failure rather than success —',
        'a check that cannot read the artifact has proven nothing about it.',
      ].join('\n      '),
    );
    return;
  }

  // The manifest says what each declared ABI must contain; it cannot say
  // anything about an ABI nobody declared. Adding one to abiFilters or
  // reactNativeArchitectures would otherwise ship a tree this check never
  // opens — and the variant allowlist is matched by exact name, so that tree
  // would carry only the generic portable-C pair.
  const declaredAbis = new Set(manifest.abis.map(entry => entry.abi));
  const libPrefix = `${prefix}lib/`;
  const shippedAbis = [
    ...new Set(
      [...entries]
        .filter(entry => entry.startsWith(libPrefix))
        .map(entry => entry.slice(libPrefix.length).split('/')[0])
        .filter(Boolean),
    ),
  ].sort();
  report.push(`  ABIs in the artifact: ${shippedAbis.join(', ') || 'none'}`);
  for (const abi of shippedAbis.filter(name => !declaredAbis.has(name))) {
    report.push(`    UNDECLARED  ${libPrefix}${abi}/`);
    fail(
      [
        `${artifactName} ships ${libPrefix}${abi}/, which the manifest does not declare.`,
        'Nothing checked that tree, so its native payload is unverified. Either declare the ABI in',
        'scripts/android-payload-manifest.json, or drop it from reactNativeArchitectures and the',
        "app's abiFilters so it is not shipped.",
      ].join('\n      '),
    );
  }

  // Only an APK is mapped in place. A bundle is repackaged by bundletool on
  // the way to the device, so its offsets say nothing about what installs.
  let zipIndex = null;
  if (kind === 'apk') {
    try {
      zipIndex = readZipIndex(archive);
    } catch (err) {
      report.push(`  UNREADABLE — ${err.message}`);
      fail(
        [
          `could not read the archive layout of ${artifactName}: ${err.message}.`,
          'The payload check could not run, so it reports failure rather than success —',
          'a check that cannot read the artifact has proven nothing about it.',
        ].join('\n      '),
      );
      return;
    }
  }

  checkAssets({
    archive,
    prefix,
    entries,
    assets: manifest.assets,
    artifactName,
    report,
    fail,
  });

  const acceleratorCapableAbis = [];

  for (const abi of manifest.abis) {
    report.push(`  ${abi.abi}`);

    const missingLibs = [];
    for (const lib of abi.requiredLibs) {
      const entry = `${prefix}lib/${abi.abi}/${lib}`;
      if (!entries.has(entry)) {
        missingLibs.push(entry);
      }
    }
    report.push(
      `    libraries: ${abi.requiredLibs.length - missingLibs.length}/${abi.requiredLibs.length} present`,
    );
    for (const entry of missingLibs) {
      report.push(`      MISSING  ${entry}`);
      fail(
        [
          `${artifactName} is missing ${entry}.`,
          'The build did not produce every library the manifest requires. If the variant allowlist',
          '(ORG_GRADLE_PROJECT_rnllamaVariants) was narrowed, widen it to match the manifest; if the',
          'manifest is what changed, update scripts/android-payload-manifest.json in the same pull request.',
        ].join('\n      '),
      );
    }

    checkAlignment({
      archive,
      prefix,
      entries,
      abi,
      artifactName,
      zipIndex,
      report,
      fail,
    });

    const extras = [...entries]
      .filter(entry => entry.startsWith(`${prefix}lib/${abi.abi}/librnllama`))
      .map(entry => path.basename(entry))
      .filter(lib => !abi.requiredLibs.includes(lib))
      .sort();
    report.push(
      `    extra rnllama libraries: ${extras.length > 0 ? extras.join(', ') : 'none'}`,
    );

    // The whole tree, not the required list: the accelerator variant is itself
    // required, so deriving this from what is left over would find nothing and
    // refuse a correct artifact.
    const canLoadAssets = [...entries].some(
      entry =>
        entry.startsWith(`${prefix}lib/${abi.abi}/`) &&
        isAcceleratorLib(path.basename(entry)),
    );
    if (canLoadAssets) {
      acceleratorCapableAbis.push(abi.abi);
    }
    report.push(
      `    can load the DSP assets: ${canLoadAssets ? 'yes' : 'no'} (declared ${manifest.assets.usableByAbis.includes(abi.abi) ? 'yes' : 'no'})`,
    );

    for (const rule of abi.requiredSymbols || []) {
      const entry = `${prefix}lib/${abi.abi}/${rule.lib}`;
      if (missingLibs.includes(entry)) {
        continue;
      }
      checkSymbolRule({rule, archive, artifactName, entry, report, fail});
    }
  }

  // Derived from the artifact rather than from the manifest that declares it:
  // equality between two readings of the same document would hold whatever
  // either said.
  const declaredUsable = [...manifest.assets.usableByAbis].sort();
  const observedUsable = [...acceleratorCapableAbis].sort();
  if (declaredUsable.join(',') !== observedUsable.join(',')) {
    fail(
      [
        `${artifactName} ships accelerator libraries for ${observedUsable.join(', ') || 'no ABI'},`,
        `but the manifest declares the DSP assets usable by ${declaredUsable.join(', ') || 'no ABI'}.`,
        'The assets are packaged once per artifact and cannot be scoped to an ABI, so this is a',
        'declaration of who can load them, not a packaging rule. Either the accelerator ladder',
        'moved to a different ABI, or usableByAbis in scripts/android-payload-manifest.json is stale.',
      ].join('\n      '),
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifest);

  if (args.printVariants) {
    process.stdout.write(
      `${variantsFromManifest(manifest, args.manifest).join(',')}\n`,
    );
    return 0;
  }

  const report = ['Android payload check', `manifest: ${args.manifest}`, ''];
  const failures = [];

  for (const [flag, kind] of [
    ['apk', 'apk'],
    ['aab', 'aab'],
  ]) {
    if (args[flag]) {
      checkArtifact({archive: args[flag], kind, manifest, report, failures});
      report.push('');
    }
  }

  report.push(
    failures.length === 0
      ? 'PASS: every declared library, asset and backend symbol is present.'
      : failures.join('\n\n'),
  );

  // The report file is written before the verdict is printed. It is the
  // evidence that the check ran, so a pass nobody can audit is not a pass —
  // and a run that printed PASS and then failed on the write would read, to a
  // human scanning the log, as a pass.
  const text = `${report.join('\n')}\n`;
  if (args.report) {
    try {
      fs.writeFileSync(args.report, text);
    } catch (err) {
      process.stdout.write(`${report.slice(0, -1).join('\n')}\n`);
      throw new Error(
        `could not write the report to ${args.report}: ${err.message}. The check ran, but its evidence could not be recorded.`,
      );
    }
  }
  process.stdout.write(text);
  return failures.length === 0 ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  readDynsym,
  readProgramHeaders,
  readZipIndex,
  variantsFromManifest,
};
