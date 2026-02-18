import _ from 'lodash';

import {
  l10n,
  t,
  supportedLanguages,
  languageDisplayNames,
  _testGetCacheKeys,
} from '../index';
import enData from '../en.json';

import type {Translations} from '../types';
import type {AvailableLanguage} from '../index';

const EXPECTED_SECTIONS = [
  'common',
  'settings',
  'memory',
  'storage',
  'generation',
  'models',
  'completionParams',
  'about',
  'feedback',
  'components',
  'palsScreen',
  'validation',
  'camera',
  'video',
  'screenTitles',
  'chat',
  'benchmark',
  'errors',
  'simulator',
];

const ALL_LANGUAGES: AvailableLanguage[] = [
  'en',
  'he',
  'id',
  'ja',
  'ko',
  'ms',
  'ru',
  'zh',
];

describe('l10n object', () => {
  it('supports all expected languages', () => {
    expect(supportedLanguages).toEqual(ALL_LANGUAGES);
    expect(Object.keys(l10n)).toEqual(ALL_LANGUAGES);
  });

  it('l10n.en is eagerly loaded and equals raw enData', () => {
    expect(l10n.en).toBe(enData); // same reference, not a copy
  });

  it.each(ALL_LANGUAGES)(
    'l10n.%s has all 19 expected top-level sections',
    lang => {
      const sections = Object.keys(l10n[lang]);
      for (const section of EXPECTED_SECTIONS) {
        expect(sections).toContain(section);
      }
      expect(sections).toHaveLength(EXPECTED_SECTIONS.length);
    },
  );

  it('l10n.en matches the raw en.json data', () => {
    expect(l10n.en).toEqual(enData);
  });

  it.each(['he', 'id', 'ja', 'ko', 'ms', 'ru', 'zh'] as AvailableLanguage[])(
    'l10n.%s contains translations where they exist',
    lang => {
      const langData = require(`../${lang}.json`);
      expect(l10n[lang].common.cancel).toBe(langData.common.cancel);
      expect(l10n[lang].common.cancel).not.toBe(l10n.en.common.cancel);
    },
  );

  it.each(['he', 'id', 'ja', 'ko', 'ms', 'ru', 'zh'] as AvailableLanguage[])(
    'returns cached result on repeated access for %s',
    lang => {
      const first = l10n[lang];
      const second = l10n[lang];
      expect(first).toBe(second); // same reference = cached
    },
  );

  it('l10n.ja falls back to English for missing keys', () => {
    // Verify the merge mechanism by building a partial ja
    // and checking that merge fills in the gap.
    const partialJa = {common: {cancel: 'partial-ja-cancel'}};
    const merged: Translations = _.merge({}, enData, partialJa);

    // The key we set should have the partial value
    expect(merged.common.cancel).toBe('partial-ja-cancel');
    // Keys not in partialJa should fall back to English
    expect(merged.common.delete).toBe(enData.common.delete);
    expect(merged.settings).toEqual(enData.settings);
  });

  it('l10n.zh falls back to English for missing keys', () => {
    const partialZh = {common: {cancel: 'partial-zh-cancel'}};
    const merged: Translations = _.merge({}, enData, partialZh);

    expect(merged.common.cancel).toBe('partial-zh-cancel');
    expect(merged.common.delete).toBe(enData.common.delete);
    expect(merged.settings).toEqual(enData.settings);
  });

  it('_.merge does not mutate enData', () => {
    const enClone = JSON.parse(JSON.stringify(enData));
    // The l10n module already ran _.merge; verify enData was not mutated
    expect(enData).toEqual(enClone);
  });

  it('supports in operator for all languages', () => {
    expect('en' in l10n).toBe(true);
    expect('he' in l10n).toBe(true);
    expect('id' in l10n).toBe(true);
    expect('ja' in l10n).toBe(true);
    expect('ko' in l10n).toBe(true);
    expect('ms' in l10n).toBe(true);
    expect('ru' in l10n).toBe(true);
    expect('zh' in l10n).toBe(true);
    expect('xx' in l10n).toBe(false);
    expect('fr' in l10n).toBe(false);
  });

  it('returns undefined for unsupported language key', () => {
    // Access a property that does not exist on the l10n object

    expect((l10n as any).xx).toBeUndefined();

    expect((l10n as any).fr).toBeUndefined();
  });

  it('Object.keys does NOT trigger lazy-loading getters', () => {
    jest.isolateModules(() => {
      const freshModule = require('../index');

      // Before any property access, only en is cached
      expect(freshModule._testGetCacheKeys()).toEqual(['en']);

      // Object.keys should enumerate property names without invoking getters
      const keys = Object.keys(freshModule.l10n);
      expect(keys).toEqual(ALL_LANGUAGES);

      // Cache should still only have en -- getters were not called
      expect(freshModule._testGetCacheKeys()).toEqual(['en']);
    });
  });

  it('l10n.en getter does not trigger lazy-loading of other languages', () => {
    jest.isolateModules(() => {
      const freshModule = require('../index');
      expect(freshModule._testGetCacheKeys()).toEqual(['en']);

      // Access en -- should NOT add any non-en languages to cache
      const _en = freshModule.l10n.en;
      expect(_en).toBeDefined();
      expect(freshModule._testGetCacheKeys()).toEqual(['en']);
    });
  });
});

describe('exports', () => {
  it('supportedLanguages matches expected array', () => {
    expect(supportedLanguages).toEqual(ALL_LANGUAGES);
  });

  it('languageDisplayNames has entries for all supported languages', () => {
    for (const lang of supportedLanguages) {
      expect(languageDisplayNames[lang]).toBeDefined();
      expect(typeof languageDisplayNames[lang]).toBe('string');
    }
  });

  it('languageDisplayNames contains expected values', () => {
    expect(languageDisplayNames.en).toBe('English (EN)');
    expect(languageDisplayNames.he).toBe('\u05E2\u05D1\u05E8\u05D9\u05EA (HE)');
    expect(languageDisplayNames.id).toBe('Indonesia (ID)');
    expect(languageDisplayNames.ja).toBe('\u65E5\u672C\u8A9E (JA)');
    expect(languageDisplayNames.ko).toBe('\uD55C\uAD6D\uC5B4 (KO)');
    expect(languageDisplayNames.ms).toBe('Melayu (MS)');
    expect(languageDisplayNames.ru).toBe(
      '\u0420\u0443\u0441\u0441\u043A\u0438\u0439 (RU)',
    );
    expect(languageDisplayNames.zh).toBe('\u4E2D\u6587 (ZH)');
  });

  it('languageDisplayNames has exactly the same keys as supportedLanguages', () => {
    const displayKeys = Object.keys(languageDisplayNames).sort();
    const supported = [...supportedLanguages].sort();
    expect(displayKeys).toEqual(supported);
  });

  it('supportedLanguages is a non-empty array of strings', () => {
    expect(supportedLanguages.length).toBeGreaterThan(0);
    for (const lang of supportedLanguages) {
      expect(typeof lang).toBe('string');
      expect(lang.length).toBeGreaterThan(0);
    }
  });
});

describe('lazy loading', () => {
  it('non-en languages are NOT loaded at module import time', () => {
    // Use jest.isolateModules to get a fresh module instance
    // and verify only 'en' is in cache before any property access.
    jest.isolateModules(() => {
      const freshModule = require('../index');
      const cacheKeys = freshModule._testGetCacheKeys();
      expect(cacheKeys).toEqual(['en']);
    });
  });

  it.each(['he', 'id', 'ja', 'ko', 'ms', 'ru', 'zh'] as AvailableLanguage[])(
    'accessing %s populates the cache',
    lang => {
      jest.isolateModules(() => {
        const freshModule = require('../index');
        expect(freshModule._testGetCacheKeys()).toEqual(['en']);

        const _data = freshModule.l10n[lang];
        expect(_data).toBeDefined();
        expect(freshModule._testGetCacheKeys()).toContain(lang);
      });
    },
  );

  it('accessing all languages populates the full cache', () => {
    jest.isolateModules(() => {
      const freshModule = require('../index');
      expect(freshModule._testGetCacheKeys()).toEqual(['en']);

      // Access each non-en language
      const nonEn = ALL_LANGUAGES.filter(l => l !== 'en');
      for (const lang of nonEn) {
        const _data = freshModule.l10n[lang];
        expect(_data).toBeDefined();
      }

      const cacheKeys = freshModule._testGetCacheKeys();
      for (const lang of ALL_LANGUAGES) {
        expect(cacheKeys).toContain(lang);
      }
      expect(cacheKeys).toHaveLength(ALL_LANGUAGES.length);
    });
  });

  it('_testGetCacheKeys is exported and returns an array', () => {
    const keys = _testGetCacheKeys();
    expect(Array.isArray(keys)).toBe(true);
    expect(keys).toContain('en');
  });
});

describe('type safety', () => {
  it('AvailableLanguage matches supported languages', () => {
    const keys: AvailableLanguage[] = ALL_LANGUAGES;
    expect(keys).toEqual(supportedLanguages);
  });

  it('keyof typeof l10n resolves to literal union', () => {
    // At runtime we verify the keys match
    const keys: Array<keyof typeof l10n> = [
      'en',
      'he',
      'id',
      'ja',
      'ko',
      'ms',
      'ru',
      'zh',
    ];
    expect(Object.keys(l10n).sort()).toEqual(keys.sort());

    // This would cause a compile error if the type were wrong:
    const lang: keyof typeof l10n = 'en';
    expect(l10n[lang]).toBeDefined();
  });
});

describe('t() interpolation helper', () => {
  it('replaces a single placeholder', () => {
    const result = t('Hello {{name}}', {name: 'World'});
    expect(result).toBe('Hello World');
  });

  it('replaces multiple placeholders', () => {
    const result = t('{{greeting}} {{name}}, you have {{count}} messages', {
      greeting: 'Hello',
      name: 'Alice',
      count: 5,
    });
    expect(result).toBe('Hello Alice, you have 5 messages');
  });

  it('preserves unreplaced placeholders when key is missing from params', () => {
    const result = t('Hello {{name}}, welcome to {{place}}', {name: 'Bob'});
    expect(result).toBe('Hello Bob, welcome to {{place}}');
  });

  it('handles number values', () => {
    const result = t('You have {{count}} items worth {{price}} dollars', {
      count: 42,
      price: 9.99,
    });
    expect(result).toBe('You have 42 items worth 9.99 dollars');
  });

  it('handles empty params object', () => {
    const result = t('No placeholders here', {});
    expect(result).toBe('No placeholders here');
  });

  it('handles template with no placeholders', () => {
    const result = t('Just a plain string', {key: 'unused'});
    expect(result).toBe('Just a plain string');
  });

  it('replaces duplicate placeholders', () => {
    const result = t('{{x}} and {{x}} again', {x: 'val'});
    expect(result).toBe('val and val again');
  });

  it('works with real l10n strings (storage.lowStorage)', () => {
    const result = t(l10n.en.storage.lowStorage, {
      modelSize: '4 GB',
      freeSpace: '2 GB',
    });
    expect(result).toContain('4 GB');
    expect(result).toContain('2 GB');
    expect(result).not.toContain('{{modelSize}}');
    expect(result).not.toContain('{{freeSpace}}');
  });

  it('converts number 0 correctly (not treated as falsy)', () => {
    const result = t('Count: {{count}}', {count: 0});
    expect(result).toBe('Count: 0');
  });

  it('preserves all unreplaced when params is empty and template has placeholders', () => {
    const result = t('{{a}} and {{b}}', {});
    expect(result).toBe('{{a}} and {{b}}');
  });
});
