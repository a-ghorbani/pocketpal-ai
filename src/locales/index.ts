import _ from 'lodash';
import dayjs from 'dayjs';

import enData from './en.json';

import type {Translations} from './types';

// ─── Language Registry (single source of truth) ──────────────────────
// To add a language: 1) add entry here, 2) place JSON in src/locales/,
// 3) add case to requireLanguageData(), 4) add getter to l10n object.
const languageRegistry = {
  en: {displayName: 'English (EN)'},
  fa: {displayName: 'فارسی (FA)'},
  he: {displayName: 'עברית (HE)'},
  id: {displayName: 'Indonesia (ID)'},
  ja: {displayName: '日本語 (JA)'},
  ko: {displayName: '한국어 (KO)'},
  ms: {displayName: 'Melayu (MS)'},
  ru: {displayName: 'Русский (RU)'},
  uk: {displayName: 'Українська (UK)'},
  zh: {displayName: '中文 (ZH)'},
  zh_Hant: {displayName: '繁體中文 (ZH_HANT)'},
} as const;

export type AvailableLanguage = keyof typeof languageRegistry;
export const supportedLanguages = Object.keys(
  languageRegistry,
) as AvailableLanguage[];

export const languageDisplayNames: Record<AvailableLanguage, string> = {
  en: languageRegistry.en.displayName,
  fa: languageRegistry.fa.displayName,
  he: languageRegistry.he.displayName,
  id: languageRegistry.id.displayName,
  ja: languageRegistry.ja.displayName,
  ko: languageRegistry.ko.displayName,
  ms: languageRegistry.ms.displayName,
  ru: languageRegistry.ru.displayName,
  uk: languageRegistry.uk.displayName,
  zh: languageRegistry.zh.displayName,
  zh_Hant: languageRegistry.zh_Hant.displayName,
};

// ─── Lazy Loading ────────────────────────────────────────────────────
const cache: Partial<Record<AvailableLanguage, Translations>> = {
  en: enData,
};

// Metro bundles these at build time, but JS doesn't parse them until require() is called
function requireLanguageData(lang: AvailableLanguage): object | null {
  switch (lang) {
    case 'fa':
      return require('./fa.json');
    case 'he':
      return require('./he.json');
    case 'id':
      return require('./id.json');
    case 'ja':
      return require('./ja.json');
    case 'ko':
      return require('./ko.json');
    case 'ms':
      return require('./ms.json');
    case 'ru':
      return require('./ru.json');
    case 'uk':
      return require('./uk.json');
    case 'zh':
      return require('./zh.json');
    case 'zh_Hant':
      return require('./zh_Hant.json');
    default:
      return null;
  }
}

function getTranslations(lang: AvailableLanguage): Translations {
  if (cache[lang]) {
    return cache[lang]!;
  }
  const langData = requireLanguageData(lang);
  const merged: Translations = langData
    ? _.merge({}, enData, langData)
    : enData;
  cache[lang] = merged;
  return merged;
}

// Expose cache keys for testing lazy-loading behavior
export function _testGetCacheKeys(): string[] {
  return Object.keys(cache);
}

// ─── Getter-based l10n object ────────────────────────────────────────
// Looks like {en: Translations, id: Translations, ...} but only loads
// non-en languages on first property access.
export const l10n = {
  get en(): Translations {
    return enData;
  },
  get fa(): Translations {
    return getTranslations('fa');
  },
  get he(): Translations {
    return getTranslations('he');
  },
  get id(): Translations {
    return getTranslations('id');
  },
  get ja(): Translations {
    return getTranslations('ja');
  },
  get ko(): Translations {
    return getTranslations('ko');
  },
  get ms(): Translations {
    return getTranslations('ms');
  },
  get ru(): Translations {
    return getTranslations('ru');
  },
  get uk(): Translations {
    return getTranslations('uk');
  },
  get zh(): Translations {
    return getTranslations('zh');
  },
  get zh_Hant(): Translations {
    return getTranslations('zh_Hant');
  },
};

// ─── Interpolation helper ────────────────────────────────────────────
/**
 * Typed interpolation helper.
 * Replaces all {{placeholder}} patterns in the template with values from the params object.
 *
 * @example
 * t(l10n.en.storage.lowStorage, { modelSize: '4 GB', freeSpace: '2 GB' })
 * // => 'Storage low! Model 4 GB > 2 GB free'
 */
export function t(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) =>
    String(params[key] ?? `{{${key}}}`),
  );
}

// ─── Dayjs locale ───────────────────────────────────────────────────
export const initLocale = (locale?: AvailableLanguage) => {
  const locales: Record<AvailableLanguage, unknown> = {
    en: require('dayjs/locale/en'),
    fa: require('dayjs/locale/fa'),
    he: require('dayjs/locale/he'),
    id: require('dayjs/locale/id'),
    ja: require('dayjs/locale/ja'),
    ko: require('dayjs/locale/ko'),
    ms: require('dayjs/locale/ms'),
    ru: require('dayjs/locale/ru'),
    uk: require('dayjs/locale/uk'),
    zh: require('dayjs/locale/zh'),
    zh_Hant: require('dayjs/locale/zh-tw'),
  };

  locale ? locales[locale] : locales.en;
  dayjs.locale(locale);
};
