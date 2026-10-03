const fs = require('fs');
const path = require('path');

const {extractRegistryLanguages} = require('../lib/registry-languages');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_PATH = path.join(ROOT, 'src', 'locales', 'index.ts');
const SPEC_PATH = path.join(
  ROOT,
  'e2e',
  'specs',
  'features',
  'language.spec.ts',
);

// The e2e locale lists are hand-maintained value fixtures, so they can
// drift from the registry. This twin cross-checks them on every jest run;
// a remote e2e package has no src/ to read, so the guard cannot live in
// the spec itself.
function parseLanguageOrder(specSource) {
  const match = specSource.match(/const LANGUAGE_ORDER[^;]*=\s*\[([^\]]*)\]/);
  if (!match) {
    return null;
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

// Top-level keys are exactly the keys whose value is an object literal;
// the nested screenTitle/firstCardTitle values are strings.
function parseLanguageAssertionKeys(specSource) {
  const match = specSource.match(
    /const LANGUAGE_ASSERTIONS[^=]*=\s*\{([\s\S]*?)\n\};/,
  );
  if (!match) {
    return null;
  }
  return [...match[1].matchAll(/^\s*'?([A-Za-z_]\w*)'?\s*:\s*\{/gm)].map(
    m => m[1],
  );
}

describe('e2e language lists stay in sync with the locale registry', () => {
  const registry = extractRegistryLanguages(
    fs.readFileSync(INDEX_PATH, 'utf-8'),
  );
  if (!registry) {
    throw new Error(`Could not parse languageRegistry in ${INDEX_PATH}`);
  }

  const specSource = fs.readFileSync(SPEC_PATH, 'utf-8');
  const order = parseLanguageOrder(specSource);
  if (!order) {
    throw new Error(`Could not parse LANGUAGE_ORDER in ${SPEC_PATH}`);
  }
  const assertionKeys = parseLanguageAssertionKeys(specSource);
  if (!assertionKeys) {
    throw new Error(`Could not parse LANGUAGE_ASSERTIONS in ${SPEC_PATH}`);
  }

  const expected = [...registry, 'en'].sort();

  it('LANGUAGE_ORDER covers exactly the registry plus en', () => {
    expect([...new Set(order)].sort()).toEqual(expected);
  });

  it('LANGUAGE_ASSERTIONS covers exactly the registry plus en', () => {
    expect([...new Set(assertionKeys)].sort()).toEqual(expected);
  });

  it('LANGUAGE_ORDER ends with en to restore the default locale', () => {
    expect(order[order.length - 1]).toBe('en');
  });
});
