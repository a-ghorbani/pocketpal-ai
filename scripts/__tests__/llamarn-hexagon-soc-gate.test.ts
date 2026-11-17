import * as fs from 'fs';
import * as path from 'path';

const RNLLAMA_JAVA = path.join(
  __dirname,
  '..',
  '..',
  'node_modules',
  'llama.rn',
  'android',
  'src',
  'main',
  'java',
  'com',
  'rnllama',
  'RNLlama.java',
);
const source = fs.readFileSync(RNLLAMA_JAVA, 'utf-8');

type BuildFields = {
  SOC_MODEL?: string;
  SOC_MANUFACTURER?: string;
  HARDWARE?: string;
  BOARD?: string;
  MANUFACTURER?: string;
  BRAND?: string;
  MODEL?: string;
  SDK_INT: number;
};

function parsePatterns(): Record<string, RegExp> {
  const patterns: Record<string, RegExp> = {};
  const decl =
    /Pattern\s+(\w+)\s*=\s*Pattern\.compile\(\s*"((?:[^"\\]|\\.)*)"\s*(,\s*Pattern\.CASE_INSENSITIVE\s*)?\)/g;
  for (const [, name, body, insensitive] of source.matchAll(decl)) {
    patterns[name] = new RegExp(
      body.replace(/\\(.)/g, '$1'),
      insensitive ? 'i' : '',
    );
  }
  return patterns;
}

function methodBody(name: string): string | null {
  const head = source.indexOf(`private static boolean ${name}() {`);
  if (head === -1) {
    return null;
  }
  const open = source.indexOf('{', head);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}' && --depth === 0) {
      return source
        .slice(open + 1, i)
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  return null;
}

const P = parsePatterns();
const lower = (v?: string) => (v == null ? '' : v.toLowerCase());
const upper = (v?: string) => (v == null ? '' : v.toUpperCase());

// Mirrors of the RNLlama.java gate methods; the pin below fails if those change shape.
function hasHexagonCodenameHint(b: BuildFields): boolean {
  return P.HEXAGON_CODENAME_PATTERN.test(
    `${lower(b.HARDWARE)} ${lower(b.BOARD)}`,
  );
}

function hasQualcommDeviceHint(b: BuildFields): boolean {
  if (hasHexagonCodenameHint(b)) {
    return true;
  }
  let hints = [b.HARDWARE, b.BOARD, b.MANUFACTURER, b.BRAND, b.MODEL]
    .map(lower)
    .join(' ');
  if (b.SDK_INT >= 31) {
    hints += ` ${lower(b.SOC_MANUFACTURER)} ${lower(b.SOC_MODEL)}`;
  }
  return P.QUALCOMM_HINT_PATTERN.test(hints);
}

function hasAdrenoGpuHint(b: BuildFields): boolean {
  if (hasQualcommDeviceHint(b)) {
    return true;
  }
  const soc = upper(b.SOC_MODEL);
  return (
    b.SDK_INT >= 31 && soc !== '' && P.SNAPDRAGON_8_SERIES_SOC_PATTERN.test(soc)
  );
}

function isHexagonSupported(b: BuildFields): boolean {
  const qualcomm = hasQualcommDeviceHint(b);
  const soc = upper(b.SOC_MODEL);
  if (b.SDK_INT >= 31 && soc !== '') {
    if (P.KNOWN_HEXAGON_SOC_PATTERN.test(soc)) {
      return true;
    }
    if (
      qualcomm &&
      (P.SNAPDRAGON_8_SERIES_SOC_PATTERN.test(soc) ||
        P.SNAPDRAGON_8_SERIES_NAME_PATTERN.test(soc))
    ) {
      return true;
    }
  }
  return qualcomm && hasHexagonCodenameHint(b);
}

// HONOR MagicPad3 Pro, as reported in #1089.
const HONOR_MAGICPAD3_PRO: BuildFields = {
  SOC_MODEL: 'SM8850P',
  SOC_MANUFACTURER: 'QTI',
  HARDWARE: 'qcom',
  BOARD: 'YLP',
  MANUFACTURER: 'HONOR',
  BRAND: 'HONOR',
  MODEL: 'YLP-W00',
  SDK_INT: 37,
};

describe('the mirror tracks RNLlama.java', () => {
  it('parses every pattern the gate reads', () => {
    for (const name of [
      'QUALCOMM_HINT_PATTERN',
      'KNOWN_HEXAGON_SOC_PATTERN',
      'SNAPDRAGON_8_SERIES_SOC_PATTERN',
      'SNAPDRAGON_8_SERIES_NAME_PATTERN',
      'HEXAGON_CODENAME_PATTERN',
    ]) {
      expect(P[name]).toBeInstanceOf(RegExp);
    }
  });

  it('pins the gate methods it mirrors', () => {
    expect({
      hasHexagonCodenameHint: methodBody('hasHexagonCodenameHint'),
      hasQualcommDeviceHint: methodBody('hasQualcommDeviceHint'),
      hasAdrenoGpuHint: methodBody('hasAdrenoGpuHint'),
      isHexagonSupported: methodBody('isHexagonSupported'),
    }).toEqual({
      hasHexagonCodenameHint:
        'String hardwareHints = lowerOrEmpty(Build.HARDWARE) + " " + lowerOrEmpty(Build.BOARD); return HEXAGON_CODENAME_PATTERN.matcher(hardwareHints).find();',
      hasQualcommDeviceHint:
        "if (hasHexagonCodenameHint()) { return true; } StringBuilder hints = new StringBuilder(); hints .append(lowerOrEmpty(Build.HARDWARE)).append(' ') .append(lowerOrEmpty(Build.BOARD)).append(' ') .append(lowerOrEmpty(Build.MANUFACTURER)).append(' ') .append(lowerOrEmpty(Build.BRAND)).append(' ') .append(lowerOrEmpty(Build.MODEL)); if (Build.VERSION.SDK_INT >= 31) { hints.append(' ') .append(lowerOrEmpty(Build.SOC_MANUFACTURER)).append(' ') .append(lowerOrEmpty(Build.SOC_MODEL)); } return QUALCOMM_HINT_PATTERN.matcher(hints.toString()).find();",
      hasAdrenoGpuHint:
        'if (hasQualcommDeviceHint()) { return true; } if (Build.VERSION.SDK_INT >= 31) { String socModel = upperOrEmpty(Build.SOC_MODEL); if (!socModel.isEmpty() && SNAPDRAGON_8_SERIES_SOC_PATTERN.matcher(socModel).find()) { return true; } } return false;',
      isHexagonSupported:
        'boolean hasQualcommHint = hasQualcommDeviceHint(); if (Build.VERSION.SDK_INT >= 31) { String socModel = upperOrEmpty(Build.SOC_MODEL); if (!socModel.isEmpty()) { if (KNOWN_HEXAGON_SOC_PATTERN.matcher(socModel).find()) { return true; } if (hasQualcommHint && (SNAPDRAGON_8_SERIES_SOC_PATTERN.matcher(socModel).find() || SNAPDRAGON_8_SERIES_NAME_PATTERN.matcher(socModel).find())) { return true; } } } return hasQualcommHint && hasHexagonCodenameHint();',
    });
  });
});

describe('Hexagon and Adreno detection gate the hexagon_opencl library', () => {
  it.each([
    ['SM8850P', HONOR_MAGICPAD3_PRO],
    ['SM8850', {...HONOR_MAGICPAD3_PRO, SOC_MODEL: 'SM8850'}],
  ])('detects both on a %s phone', (_soc, build) => {
    expect({
      hexagon: isHexagonSupported(build),
      adreno: hasAdrenoGpuHint(build),
    }).toEqual({hexagon: true, adreno: true});
  });
});
