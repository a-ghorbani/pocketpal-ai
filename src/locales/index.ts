import _ from 'lodash';

import enData from './en.json';

import type {Translations} from './types';

// ─── Language Registry (single source of truth) ──────────────────────
// To add a language: 1) add entry here, 2) place JSON in src/locales/,
// 3) add case to requireLanguageData(), 4) add getter to l10n object.
const languageRegistry = {
  en: {displayName: 'English (EN)'},
  id: {displayName: 'Indonesia (ID)'},
  ja: {displayName: '日本語 (JA)'},
  zh: {displayName: '中文 (ZH)'},
} as const;

export type AvailableLanguage = keyof typeof languageRegistry;
export const supportedLanguages = Object.keys(
  languageRegistry,
) as AvailableLanguage[];

export const languageDisplayNames: Record<AvailableLanguage, string> = {
  en: languageRegistry.en.displayName,
  id: languageRegistry.id.displayName,
  ja: languageRegistry.ja.displayName,
  zh: languageRegistry.zh.displayName,
};

// ─── Lazy Loading ────────────────────────────────────────────────────
const cache: Partial<Record<AvailableLanguage, Translations>> = {
  en: enData,
};

// Metro bundles these at build time, but JS doesn't parse them until require() is called
function requireLanguageData(lang: AvailableLanguage): object | null {
  switch (lang) {
    case 'id':
      return require('./id.json');
    case 'ja':
      return require('./ja.json');
    case 'zh':
      return require('./zh.json');
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
  get id(): Translations {
    return getTranslations('id');
  },
  get ja(): Translations {
    return getTranslations('ja');
  },
  get zh(): Translations {
    return getTranslations('zh');
  },
};

// NOTE: Do NOT use `as const` on the l10n getter object — `as const` on getters
// is a no-op (getters already lack setters) and would be misleading.

// ─── Interpolation helper (unchanged) ────────────────────────────────
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
