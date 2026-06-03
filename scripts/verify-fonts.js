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

  if (errors.length > 0) {
    console.error('\nverify-fonts: FAIL');
    for (const e of errors) {
      console.error('  ' + e);
    }
    process.exit(1);
  }

  console.log('\nverify-fonts: OK — all families bundled on all platforms.');
}

main();
