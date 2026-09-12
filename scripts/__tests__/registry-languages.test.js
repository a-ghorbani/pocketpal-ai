const fs = require('fs');
const path = require('path');

const {extractRegistryLanguages} = require('../lib/registry-languages');

const INDEX_PATH = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'locales',
  'index.ts',
);

describe('extractRegistryLanguages', () => {
  it('extracts every wired non-en locale from the real index.ts', () => {
    const source = fs.readFileSync(INDEX_PATH, 'utf-8');
    expect(extractRegistryLanguages(source)).toEqual([
      'es',
      'fa',
      'he',
      'id',
      'ja',
      'ko',
      'ms',
      'pl',
      'pt',
      'pt_BR',
      'ru',
      'uk',
      'zh',
      'zh_Hant',
    ]);
  });

  it('filters en out of the extracted keys', () => {
    const source = [
      'const languageRegistry = {',
      '  en: {displayName: "English (EN)"},',
      '  pt_BR: {displayName: "Português (PT_BR)"},',
      '} as const;',
    ].join('\n');
    expect(extractRegistryLanguages(source)).toEqual(['pt_BR']);
  });

  it('returns null when the registry block does not match', () => {
    expect(extractRegistryLanguages('export const whatever = 1;')).toBeNull();
    expect(extractRegistryLanguages('')).toBeNull();
  });
});
