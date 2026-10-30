const fs = require('fs');
const path = require('path');

const WHISPER_RN_ANDROID = path.join(
  __dirname,
  '..',
  '..',
  'node_modules',
  'whisper.rn',
  'android',
  'src',
  'main',
);
const CMAKE = path.join(WHISPER_RN_ANDROID, 'CMakeLists.txt');
const RNWHISPER_JAVA = path.join(
  WHISPER_RN_ANDROID,
  'java',
  'com',
  'rnwhisper',
  'RNWhisper.java',
);

const DOTPROD_LIB = 'rnwhisper_v8fp16_va_2_dotprod';

function parseArm64BuildSites() {
  const abiBranch =
    /^\s*(?:else)?if\s*\(.*ANDROID_ABI\}?\s+STREQUAL\s+"([^"]+)"/;
  const call = /build_library\(\s*"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"/;
  const sites = [];
  let abi = null;

  for (const line of fs.readFileSync(CMAKE, 'utf-8').split('\n')) {
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
    const site = line.match(call);
    if (site && abi === 'arm64-v8a') {
      sites.push({name: site[1], arch: site[2], flags: site[3]});
    }
  }
  return sites;
}

const javaSource = fs.readFileSync(RNWHISPER_JAVA, 'utf-8');

function parseArm64Rungs() {
  const block = javaSource.match(
    /if\s*\(\s*isArm64V8a\(\)\s*\)\s*\{([\s\S]*?)\}\s*else\s+if/,
  );
  if (!block) {
    return [];
  }
  return [
    ...block[1].matchAll(/if\s*\(([^)]*?)tryLoadLibrary\("([^"]+)"\)\)/g),
  ].map(([, condition, name]) => ({
    name,
    guards: condition
      .split('&&')
      .map(guard => guard.trim())
      .filter(Boolean),
  }));
}

function loadNativeBody() {
  const signature = javaSource.search(
    /\bboolean\s+loadNative\s*\([^)]*\)\s*\{/,
  );
  if (signature === -1) {
    return '';
  }
  const open = javaSource.indexOf('{', signature);
  let depth = 0;
  for (let i = open; i < javaSource.length; i++) {
    if (javaSource[i] === '{') {
      depth += 1;
    } else if (javaSource[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return javaSource.slice(open + 1, i);
      }
    }
  }
  return '';
}

const loadNative = loadNativeBody();

function assignmentsTo(flag) {
  return [
    ...loadNative.matchAll(
      new RegExp(`\\b${flag}\\s*([|&^]?=)(?!=)\\s*([^;]*);`, 'g'),
    ),
  ].map(([, operator, expression]) => ({
    operator,
    terms: expression
      .split('||')
      .map(term => term.trim())
      .sort(),
  }));
}

const buildSites = parseArm64BuildSites();
const rungs = parseArm64Rungs();
const hasDotProd = javaSource.match(/boolean\s+hasDotProd\s*=\s*([^;]+);/);

describe('the parse itself', () => {
  it('finds every arm64 build target', () => {
    expect(buildSites.map(site => site.name)).toEqual([
      DOTPROD_LIB,
      'rnwhisper_v8fp16_va_2',
      'rnwhisper_v8',
    ]);
  });

  it('finds every arm64 loader rung, fastest first', () => {
    expect(rungs.map(rung => rung.name)).toEqual([
      DOTPROD_LIB,
      'rnwhisper_v8fp16_va_2',
      'rnwhisper_v8',
    ]);
  });
});

describe('the arm64 dotprod rung', () => {
  it('is built with fp16 and dotprod enabled', () => {
    const site = buildSites.find(candidate => candidate.name === DOTPROD_LIB);

    expect(site.arch).toBe('arm');
    expect(site.flags).toBe('-march=armv8.2-a+fp16+dotprod');
  });

  it('loads only on a CPU reporting both fp16 and dotprod', () => {
    const rung = rungs.find(candidate => candidate.name === DOTPROD_LIB);

    expect([...rung.guards].sort()).toEqual(['hasDotProd', 'hasFp16']);
  });

  it('detects dotprod from the asimddp cpuinfo feature', () => {
    expect(hasDotProd).not.toBeNull();
    expect(hasDotProd[1]).toContain('cpuFeatures.contains("asimddp")');
  });

  it.each([
    [
      'hasDotProd',
      ['cpuFeatures.contains("asimddp")', 'cpuFeatures.contains("dotprod")'],
    ],
    [
      'hasFp16',
      ['cpuFeatures.contains("fp16")', 'cpuFeatures.contains("fphp")'],
    ],
  ])('sets %s once, from its cpuinfo features alone', (flag, terms) => {
    expect(assignmentsTo(flag)).toEqual([{operator: '=', terms}]);
  });
});

it('builds a library for every name the arm64 loader asks for', () => {
  const built = buildSites.map(site => site.name);

  for (const rung of rungs) {
    expect(built).toContain(rung.name);
  }
});
