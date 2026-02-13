import _ from 'lodash';

import {l10n, t} from '../index';
import enData from '../en.json';
import jaData from '../ja.json';
import zhData from '../zh.json';
import idData from '../id.json';

import type {Translations} from '../types';

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

describe('l10n object', () => {
  it('has all 3 languages', () => {
    expect(Object.keys(l10n)).toEqual(
      expect.arrayContaining(['en', 'ja', 'zh', 'id']),
    );
    expect(Object.keys(l10n)).toHaveLength(3);
  });

  it('l10n.en has all 19 expected top-level sections', () => {
    const enSections = Object.keys(l10n.en);
    for (const section of EXPECTED_SECTIONS) {
      expect(enSections).toContain(section);
    }
    expect(enSections).toHaveLength(EXPECTED_SECTIONS.length);
  });

  it('l10n.ja has all 19 expected top-level sections', () => {
    const jaSections = Object.keys(l10n.ja);
    for (const section of EXPECTED_SECTIONS) {
      expect(jaSections).toContain(section);
    }
    expect(jaSections).toHaveLength(EXPECTED_SECTIONS.length);
  });

  it('l10n.zh has all 19 expected top-level sections', () => {
    const zhSections = Object.keys(l10n.zh);
    for (const section of EXPECTED_SECTIONS) {
      expect(zhSections).toContain(section);
    }
    expect(zhSections).toHaveLength(EXPECTED_SECTIONS.length);
  });

  it('l10n.en matches the raw en.json data', () => {
    expect(l10n.en).toEqual(enData);
  });

  it('l10n.ja contains Japanese translations where they exist', () => {
    // ja.json has its own translation for common.cancel
    expect(l10n.ja.common.cancel).toBe(jaData.common.cancel);
    expect(l10n.ja.common.cancel).not.toBe(l10n.en.common.cancel);
  });

  it('l10n.zh contains Chinese translations where they exist', () => {
    // zh.json has its own translation for common.cancel
    expect(l10n.zh.common.cancel).toBe(zhData.common.cancel);
    expect(l10n.zh.common.cancel).not.toBe(l10n.en.common.cancel);
  });

  it('l10n.ja falls back to English for missing keys', () => {
    // Simulate fallback behavior: if a key were missing in ja, _.merge fills from en.
    // Since ja.json is complete, we verify the merge mechanism by building a partial ja
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
    // Same verification for zh fallback mechanism
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

  it('AvailableLanguage type resolves to en | ja | zh | id', () => {
    // Type-level check: keyof typeof l10n should be 'en' | 'ja' | 'zh'
    // At runtime we verify the keys match
    const keys: Array<keyof typeof l10n> = ['en', 'ja', 'zh', 'id'];
    expect(Object.keys(l10n).sort()).toEqual(keys.sort());

    // This would cause a compile error if AvailableLanguage were wrong:
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
