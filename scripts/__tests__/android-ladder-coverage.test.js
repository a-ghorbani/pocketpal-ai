const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MANIFEST_PATH = path.join(
  __dirname,
  '..',
  'android-payload-manifest.json',
);
const LLAMA_RN_ANDROID = path.join(
  ROOT,
  'node_modules',
  'llama.rn',
  'android',
  'src',
  'main',
);
const LIBRARY_CMAKE = path.join(LLAMA_RN_ANDROID, 'rnllama', 'CMakeLists.txt');
const JNI_CMAKE = path.join(LLAMA_RN_ANDROID, 'CMakeLists.txt');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

/**
 * The rungs the runtime ladder can select but the allowlist does not build,
 * each with the rung a matching device falls to instead. FEAT_I8MM and
 * FEAT_DotProd are independently optional from Armv8.2, so this is an
 * empirical claim about shipping silicon, not an architectural one.
 */
const NAMED_BETS = {
  rnllama_v8_2_i8mm:
    'rnllama_v8_2, or rnllama_v8 on a device that also lacks fp16',
};

/**
 * `build_rnllama_*` call sites, each attributed to the ABI whose
 * `if (ANDROID_ABI STREQUAL ...)` branch encloses it. Sites outside every
 * branch are built for all ABIs.
 */
function parseCallSites(cmakePath, fnName, argNames) {
  const pattern = new RegExp(
    `${fnName}\\(\\s*${argNames.map(() => '"([^"]*)"').join('\\s+')}\\s*\\)`,
  );
  const abiBranch = /^\s*(?:else)?if\s*\(.*ANDROID_ABI\s+STREQUAL\s+"([^"]+)"/;
  const sites = [];
  let abi = null;

  for (const line of fs.readFileSync(cmakePath, 'utf-8').split('\n')) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    const branch = line.match(abiBranch);
    if (branch) {
      abi = branch[1];
      continue;
    }
    if (/^\s*(?:else\s*\(|endif)/.test(line)) {
      abi = null;
      continue;
    }
    const call = line.match(pattern);
    if (call) {
      const site = {abi};
      argNames.forEach((argName, i) => {
        site[argName] = call[i + 1];
      });
      sites.push(site);
    }
  }
  return sites;
}

/**
 * What a variant is actually compiled as. `arch` and `cpu_flags` are not
 * enough: `build_rnllama_library` derives extra sources and `-D` macros from
 * the target *name*, so the hexagon variant and the plain dotprod+i8mm one
 * share both literal arguments while differing in the backend they carry.
 */
function buildSignature({name, arch, flags}) {
  return JSON.stringify({
    arch,
    flags,
    hexagon: /_hexagon/.test(name),
    opencl: /_opencl$/.test(name),
    genericSources: arch === 'generic',
  });
}

function abisFor(site) {
  return site.abi ? [site.abi] : manifest.abis.map(entry => entry.abi);
}

function requiredLibsFor(abi) {
  const entry = manifest.abis.find(candidate => candidate.abi === abi);
  return entry ? entry.requiredLibs : [];
}

function isRetained(site, abi) {
  return requiredLibsFor(abi).includes(`lib${site.name}.so`);
}

const librarySites = parseCallSites(LIBRARY_CMAKE, 'build_rnllama_library', [
  'name',
  'arch',
  'flags',
]);
const jniSites = parseCallSites(JNI_CMAKE, 'build_rnllama_jni', [
  'jniName',
  'name',
  'arch',
  'flags',
]);

describe('the parse itself', () => {
  // Without these, an upstream reformat that matches zero call sites would
  // make every for-each below pass vacuously and CI would stay green.
  it.each([
    ['library', librarySites],
    ['JNI wrapper', jniSites],
  ])('finds the expected %s call sites', (_label, sites) => {
    expect(sites).toHaveLength(8);
    expect(sites.filter(site => site.abi === null)).toHaveLength(1);
    expect(sites.filter(site => site.abi === 'arm64-v8a')).toHaveLength(6);
    expect(sites.filter(site => site.abi === 'x86_64')).toHaveLength(1);
  });
});

describe('ladder coverage', () => {
  it('builds every variant the runtime ladder can select', () => {
    const unexplained = [];

    for (const site of librarySites) {
      for (const abi of abisFor(site)) {
        if (isRetained(site, abi)) {
          continue;
        }
        if (NAMED_BETS[site.name]) {
          continue;
        }
        const equivalent = librarySites
          .filter(
            other => abisFor(other).includes(abi) && isRetained(other, abi),
          )
          .some(other => buildSignature(other) === buildSignature(site));
        if (!equivalent) {
          unexplained.push(`${abi}/${site.name}`);
        }
      }
    }

    expect(unexplained).toEqual([]);
  });

  it('states the fall-through rung for every variant it drops', () => {
    const dropped = librarySites
      .filter(site => abisFor(site).some(abi => !isRetained(site, abi)))
      .map(site => site.name);

    expect(dropped).toEqual(Object.keys(NAMED_BETS));
  });

  it('does not treat the hexagon variant as covered by its dotprod+i8mm twin', () => {
    const hexagon = librarySites.find(site => /_hexagon/.test(site.name));
    const twin = librarySites.find(
      site => site.name === 'rnllama_v8_2_dotprod_i8mm',
    );

    expect(hexagon.arch).toBe(twin.arch);
    expect(hexagon.flags).toBe(twin.flags);
    expect(buildSignature(hexagon)).not.toBe(buildSignature(twin));
  });

  it('does not treat the portable-C fallback as covered by the armv8-a rung', () => {
    const generic = librarySites.find(site => site.name === 'rnllama');
    const armv8 = librarySites.find(site => site.name === 'rnllama_v8');

    expect(buildSignature(generic)).not.toBe(buildSignature(armv8));
  });
});

describe('the ladder loads JNI wrappers, so their call sites must track the libraries', () => {
  it('pairs one wrapper with each library, on the same arch and flags', () => {
    const key = site => `${site.abi}/${site.name}/${site.arch}/${site.flags}`;

    expect(jniSites.map(key).sort()).toEqual(librarySites.map(key).sort());
    for (const site of jniSites) {
      expect(site.jniName).toBe(site.name.replace('rnllama', 'rnllama_jni'));
    }
  });

  it('requires a wrapper in the manifest for every required library', () => {
    for (const abi of manifest.abis) {
      const libs = abi.requiredLibs.filter(
        lib => !lib.startsWith('librnllama_jni'),
      );
      for (const lib of libs) {
        expect(abi.requiredLibs).toContain(
          lib.replace('librnllama', 'librnllama_jni'),
        );
      }
    }
  });
});
