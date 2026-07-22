#!/usr/bin/env node
/**
 * verify-fonts.js — bundled font asset check.
 *
 * Every `fontFamily` string referenced by the design-token typography
 * surface (src/theme/tokens/typography.ts) and by the legacy fontStyles
 * map (src/utils/theme.ts) MUST be backed by a bundled asset:
 *   - src/assets/fonts/<Name>.ttf
 *   - android/app/src/main/assets/fonts/<Name>.ttf
 *   - <string>Name.ttf</string> inside ios/PocketPal/Info.plist (UIAppFonts)
 *
 * The PostScript name of the asset must equal the filename sans `.ttf`
 * (otherwise iOS silently falls back to system) — this is verified at
 * font-acquisition time rather than here; this script only verifies
 * presence.
 *
 * Exit 0 on success, non-zero on any mismatch with a per-name error.
 *
 * Pattern mirrors scripts/validate-l10n.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPOGRAPHY_PATH = path.join(
  ROOT,
  'src',
  'theme',
  'tokens',
  'typography.ts',
);
const THEME_PATH = path.join(ROOT, 'src', 'utils', 'theme.ts');
const ASSETS_DIR = path.join(ROOT, 'src', 'assets', 'fonts');
const ANDROID_DIR = path.join(
  ROOT,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'fonts',
);
const INFO_PLIST = path.join(ROOT, 'ios', 'PocketPal', 'Info.plist');

/**
 * Extract every quoted `*-Regular`, `*-Medium`, `*-Bold`, `*-Italic`, etc.
 * font-family string literal from a TypeScript source file.
 *
 * Matches: 'Family-Variant' or "Family-Variant". Filters to identifiers
 * that look like font family names (capital first letter, contain a
 * hyphen, end in a known variant suffix). This is intentionally
 * permissive but resilient to comments — anything that doesn't look
 * like a real family name is dropped.
 */
function extractFontFamilies(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const matches = src.match(/['"]([A-Z][A-Za-z]+-[A-Za-z]+)['"]/g) || [];
  const known = new Set();
  const VARIANT_SUFFIXES = [
    'Regular',
    'Medium',
    'Bold',
    'Italic',
    'MediumItalic',
    'Light',
    'Thin',
    'SemiBold',
    'ExtraBold',
    'BoldItalic',
    'SemiBoldItalic',
  ];
  for (const m of matches) {
    const name = m.slice(1, -1);
    const idx = name.indexOf('-');
    if (idx <= 0) {
      continue;
    }
    const suffix = name.slice(idx + 1);
    if (VARIANT_SUFFIXES.includes(suffix)) {
      known.add(name);
    }
  }
  return known;
}

function listTtfNames(dir) {
  if (!fs.existsSync(dir)) {
    return new Set();
  }
  return new Set(
    fs
      .readdirSync(dir)
      .filter(n => n.endsWith('.ttf'))
      .map(n => n.replace(/\.ttf$/, '')),
  );
}

function plistTtfNames(plistPath) {
  if (!fs.existsSync(plistPath)) {
    return new Set();
  }
  const src = fs.readFileSync(plistPath, 'utf-8');
  // Naive: extract every <string>X.ttf</string> entry. UIAppFonts is the
  // only place .ttf appears in a <string>; this is fine.
  const out = new Set();
  const re = /<string>([^<]+\.ttf)<\/string>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.add(m[1].replace(/\.ttf$/, ''));
  }
  return out;
}

/**
 * Read a TrueType `cmap` and return the set of covered codepoints.
 * Handles subtable formats 4 and 12, which is everything our TTFs use.
 *
 * Simplification: format-4 segments are treated as fully covered without
 * resolving idDelta/idRangeOffset, so a codepoint a segment maps to glyph 0
 * (.notdef) would count as covered. Verified against a glyph-resolving parser
 * across all bundled TTFs with zero divergence, but it is the one direction
 * this check could fail *unsafe* — revisit if a font vendor/cut changes.
 */
function fontCodepoints(ttfPath) {
  const buf = fs.readFileSync(ttfPath);
  const numTables = buf.readUInt16BE(4);
  let cmapOff = null;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + 16 * i;
    if (buf.toString('ascii', rec, rec + 4) === 'cmap') {
      cmapOff = buf.readUInt32BE(rec + 8);
    }
  }
  if (cmapOff === null) {
    throw new Error(`${path.basename(ttfPath)}: no cmap table`);
  }

  const covered = new Set();
  const numSub = buf.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < numSub; i++) {
    const off = cmapOff + buf.readUInt32BE(cmapOff + 4 + 8 * i + 4);
    const format = buf.readUInt16BE(off);
    if (format === 4) {
      const segX2 = buf.readUInt16BE(off + 6);
      const seg = segX2 / 2;
      const endsAt = off + 14;
      const startsAt = off + 16 + segX2;
      for (let s = 0; s < seg; s++) {
        const start = buf.readUInt16BE(startsAt + 2 * s);
        const end = buf.readUInt16BE(endsAt + 2 * s);
        if (start === 0xffff) {
          continue;
        }
        for (let c = start; c <= end && c !== 0x10000; c++) {
          covered.add(c);
        }
      }
    } else if (format === 12) {
      const nGroups = buf.readUInt32BE(off + 12);
      for (let g = 0; g < nGroups; g++) {
        const go = off + 16 + 12 * g;
        const start = buf.readUInt32BE(go);
        // Cap the scan: only low-BMP letters matter for this check and a
        // format-12 group can span a huge range (emoji, CJK Ext).
        // Under-reporting coverage is safe — it can only produce a spurious
        // "add to NON_LATIN_LOCALES" failure, never a false pass.
        const end = Math.min(buf.readUInt32BE(go + 4), 0x2fff);
        for (let c = start; c <= end; c++) {
          covered.add(c);
        }
      }
    }
  }
  return covered;
}

const LETTER_RE = /\p{L}/u;

function localeLetters(localeJsonPath) {
  const used = new Set();
  const walk = node => {
    if (typeof node === 'string') {
      for (const ch of node) {
        if (LETTER_RE.test(ch)) {
          used.add(ch.codePointAt(0));
        }
      }
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) {
        walk(v);
      }
    }
  };
  walk(JSON.parse(fs.readFileSync(localeJsonPath, 'utf-8')));
  return used;
}

/**
 * Every wired locale NOT listed in NON_LATIN_LOCALES must have all of its
 * letters covered by the bundled Fraunces subset, because those locales
 * render headlines in Fraunces. Locales that ARE listed fall back to Inter
 * and are exempt.
 *
 * This exists because the Fraunces subset stops at Latin-1: Polish is Latin
 * script but needs Latin Extended-A, so "it's Latin, it's fine" is wrong.
 * Only letters are checked — shared punctuation (— • … → ✓) is absent from
 * Fraunces for every locale including `en`, and is not a regression.
 *
 * Deliberately over-approximate: it scans the whole locale JSON, not just the
 * strings that land in headline slots. So one stray non-Latin-1 letter in a
 * body string would push an otherwise-fine locale onto the fallback list and
 * cost it the serif headline. That trade is intentional — mapping keys to
 * headline slots is brittle, and a false fallback is cosmetic while a false
 * pass ships tofu.
 */
function verifyHeadlineGlyphCoverage() {
  const localesDir = path.join(ROOT, 'src', 'locales');
  const indexPath = path.join(localesDir, 'index.ts');
  // Headlines use Regular, Medium and the italics, so require coverage in
  // every cut — a future re-cut of one weight would otherwise slip past.
  const frauncesCuts = fs.existsSync(ASSETS_DIR)
    ? fs
        .readdirSync(ASSETS_DIR)
        .filter(n => /^Fraunces-.*\.ttf$/.test(n))
        .map(n => path.join(ASSETS_DIR, n))
    : [];
  // A missing Fraunces asset is already reported by the bundling check;
  // don't crash here and mask it.
  if (!fs.existsSync(indexPath) || frauncesCuts.length === 0) {
    return [];
  }
  const indexSrc = fs.readFileSync(indexPath, 'utf-8');
  const typographySrc = fs.readFileSync(TYPOGRAPHY_PATH, 'utf-8');

  const registryBlock = indexSrc.match(
    /const languageRegistry = \{([\s\S]*?)\n\} as const;/,
  );
  const exemptBlock = typographySrc.match(
    /NON_LATIN_LOCALES: ReadonlyArray<AvailableLanguage> = \[([\s\S]*?)\];/,
  );
  if (!registryBlock || !exemptBlock) {
    console.error(
      'verify-fonts: could not parse languageRegistry / NON_LATIN_LOCALES — refusing to declare success.',
    );
    process.exit(2);
  }

  const wired = [...registryBlock[1].matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
  const exempt = new Set(
    [...exemptBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]),
  );

  // Intersection across cuts: a letter counts as covered only if every
  // Fraunces weight can render it.
  const perCut = frauncesCuts.map(fontCodepoints);
  const covered = new Set(
    [...perCut[0]].filter(c => perCut.every(set => set.has(c))),
  );
  const errors = [];
  for (const lang of wired) {
    if (exempt.has(lang)) {
      continue;
    }
    const jsonPath = path.join(localesDir, `${lang}.json`);
    if (!fs.existsSync(jsonPath)) {
      continue;
    }
    const missing = [...localeLetters(jsonPath)].filter(c => !covered.has(c));
    if (missing.length > 0) {
      const sample = missing
        .slice(0, 20)
        .map(c => String.fromCodePoint(c))
        .join('');
      errors.push(
        `${lang}: ${missing.length} letter(s) not in the bundled Fraunces subset (${sample}) — ` +
          `add '${lang}' to NON_LATIN_LOCALES in src/theme/tokens/typography.ts so headlines fall back to Inter`,
      );
    }
  }
  return errors;
}

function main() {
  const families = new Set([
    ...extractFontFamilies(TYPOGRAPHY_PATH),
    ...extractFontFamilies(THEME_PATH),
  ]);

  if (families.size === 0) {
    console.error(
      'verify-fonts: no font families discovered — refusing to declare success.',
    );
    process.exit(2);
  }

  const assets = listTtfNames(ASSETS_DIR);
  const android = listTtfNames(ANDROID_DIR);
  const ios = plistTtfNames(INFO_PLIST);

  const errors = [];
  for (const name of [...families].sort()) {
    if (!assets.has(name)) {
      errors.push(`${name}: missing src/assets/fonts/${name}.ttf`);
    }
    if (!android.has(name)) {
      errors.push(
        `${name}: missing android/app/src/main/assets/fonts/${name}.ttf`,
      );
    }
    if (!ios.has(name)) {
      errors.push(
        `${name}: missing <string>${name}.ttf</string> in ios/PocketPal/Info.plist (UIAppFonts)`,
      );
    }
  }

  console.log(`verify-fonts: discovered ${families.size} font families:`);
  for (const name of [...families].sort()) {
    console.log('  ' + name);
  }

  errors.push(...verifyHeadlineGlyphCoverage());

  if (errors.length > 0) {
    console.error('\nverify-fonts: FAIL');
    for (const e of errors) {
      console.error('  ' + e);
    }
    process.exit(1);
  }

  console.log(
    '\nverify-fonts: OK — all families bundled on all platforms, ' +
      'and every Fraunces-rendered locale is covered by the bundled subset.',
  );
}

main();
