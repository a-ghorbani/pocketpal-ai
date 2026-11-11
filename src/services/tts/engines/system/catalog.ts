import type {Voice} from '../../types';

export type SystemVoiceRow = {voice: Voice; label: string};

export type SystemVoiceSection = {
  key: string;
  title: string;
  onDevice: SystemVoiceRow[];
  network: SystemVoiceRow[];
};

export type SystemLanguageOption = {value: string; label: string};

const LEGACY_LANGUAGE_CODES: Record<string, string> = {
  iw: 'he',
  in: 'id',
  ji: 'yi',
};

const ENDONYMS: Record<string, string> = {
  ar: 'العربية',
  as: 'অসমীয়া',
  bg: 'Български',
  bn: 'বাংলা',
  brx: 'बड़ो',
  bs: 'Bosanski',
  ca: 'Català',
  cs: 'Čeština',
  cy: 'Cymraeg',
  da: 'Dansk',
  de: 'Deutsch',
  doi: 'डोगरी',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español',
  et: 'Eesti',
  eu: 'Euskara',
  fa: 'فارسی',
  fi: 'Suomi',
  fil: 'Filipino',
  fr: 'Français',
  gl: 'Galego',
  gu: 'ગુજરાતી',
  he: 'עברית',
  hi: 'हिन्दी',
  hr: 'Hrvatski',
  hu: 'Magyar',
  id: 'Indonesia',
  is: 'Íslenska',
  it: 'Italiano',
  ja: '日本語',
  jv: 'Jawa',
  kk: 'Қазақ тілі',
  km: 'ខ្មែរ',
  kn: 'ಕನ್ನಡ',
  ko: '한국어',
  kok: 'कोंकणी',
  ks: 'کٲشُر',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  mai: 'मैथिली',
  ml: 'മലയാളം',
  mni: 'মৈতৈলোন্',
  mr: 'मराठी',
  ms: 'Melayu',
  nb: 'Norsk bokmål',
  ne: 'नेपाली',
  nl: 'Nederlands',
  or: 'ଓଡ଼ିଆ',
  pa: 'ਪੰਜਾਬੀ',
  pl: 'Polski',
  pt: 'Português',
  ro: 'Română',
  ru: 'Русский',
  sa: 'संस्कृत भाषा',
  sat: 'ᱥᱟᱱᱛᱟᱲᱤ',
  sd: 'سنڌي',
  si: 'සිංහල',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  sq: 'Shqip',
  sr: 'Српски',
  su: 'Basa Sunda',
  sv: 'Svenska',
  sw: 'Kiswahili',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  th: 'ไทย',
  tr: 'Türkçe',
  uk: 'Українська',
  ur: 'اردو',
  vi: 'Tiếng Việt',
  yue: '粵語',
  zh: '中文',
};

const CANTONESE_PHONE_LOCALES = new Set(['zh-hk', 'zh-mo']);

const isRegion = (segment: string) => /^([a-z]{2}|\d{3})$/.test(segment);
const isScript = (segment: string) => /^[a-z]{4}$/.test(segment);

/**
 * Normalises an Android (`zh_CN_#Hans`) or BCP-47 (`zh-Hans-CN`) locale tag
 * to `<language>-<region>` or `<language>`, lowercase.
 */
export const localeKey = (tag: string): string => {
  const segments: string[] = [];
  for (const segment of tag.toLowerCase().replace(/_/g, '-').split('-')) {
    if (segment.startsWith('#') || segment.length === 1) {
      break;
    }
    if (segment) {
      segments.push(segment);
    }
  }
  const [language, ...rest] = segments;
  if (!language) {
    return '';
  }
  const primary = LEGACY_LANGUAGE_CODES[language] ?? language;
  const region = rest.filter(s => !isScript(s)).find(isRegion);
  return region ? `${primary}-${region}` : primary;
};

export const primaryLanguage = (tag: string): string =>
  localeKey(tag).split('-')[0]!;

/** Isolated so a right-to-left endonym keeps the region on its right. */
const isolate = (text: string) => `⁨${text}⁩`;

export const languageName = (subtag: string): string => {
  const endonym = ENDONYMS[primaryLanguage(subtag)];
  return endonym ? isolate(endonym) : subtag;
};

/** "English (US)"; an unknown language shows the raw tag. */
export const languageLabel = (tag: string): string => {
  const [primary, region] = localeKey(tag).split('-');
  const endonym = primary ? ENDONYMS[primary] : undefined;
  if (!endonym) {
    return tag;
  }
  return region
    ? `${isolate(endonym)} (${region.toUpperCase()})`
    : isolate(endonym);
};

export const systemShortLabel = (voice: Voice): string => {
  const prefix = `${languageLabel(voice.language ?? '')} · `;
  return voice.name.startsWith(prefix)
    ? voice.name.slice(prefix.length)
    : voice.name;
};

export type ShownLanguagesInput = {
  phoneLocale?: string;
  appLanguage: string;
  currentVoice?: Voice | null;
  pickedLanguage?: string | null;
};

export const systemShownLanguages = ({
  phoneLocale,
  appLanguage,
  currentVoice,
  pickedLanguage,
}: ShownLanguagesInput): string[] => {
  if (pickedLanguage) {
    return [pickedLanguage];
  }
  const phone = phoneLocale ? primaryLanguage(phoneLocale) : '';
  const cantonese =
    phoneLocale && CANTONESE_PHONE_LOCALES.has(localeKey(phoneLocale))
      ? 'yue'
      : '';
  const current =
    currentVoice?.engine === 'system' && currentVoice.language
      ? primaryLanguage(currentVoice.language)
      : '';
  const languages = [phone, cantonese, primaryLanguage(appLanguage), current];
  return [...new Set(languages.filter(Boolean))];
};

const collator = new Intl.Collator(undefined, {numeric: true});

const byLabel = (a: {label: string}, b: {label: string}) =>
  collator.compare(a.label, b.label);

/**
 * One section per locale of the shown languages, in their order; within a
 * language the phone's own region first. A shown language with no voice
 * becomes one empty section keyed by its subtag.
 */
export const systemSections = (
  voices: Voice[],
  languages: string[],
  phoneLocale?: string,
): SystemVoiceSection[] => {
  const phoneKey = phoneLocale ? localeKey(phoneLocale) : '';
  const byLocale = new Map<string, Voice[]>();
  for (const voice of voices) {
    const key = localeKey(voice.language ?? '');
    byLocale.set(key, [...(byLocale.get(key) ?? []), voice]);
  }
  return languages.flatMap(language => {
    const keys = [...byLocale.keys()]
      .filter(key => key.split('-')[0] === language)
      .sort((a, b) =>
        a === phoneKey ? -1 : b === phoneKey ? 1 : a.localeCompare(b),
      );
    if (keys.length === 0) {
      return [
        {
          key: language,
          title: languageLabel(language),
          onDevice: [],
          network: [],
        },
      ];
    }
    return keys.map(key => {
      const rows = byLocale
        .get(key)!
        .map(voice => ({voice, label: systemShortLabel(voice)}));
      return {
        key,
        title: languageLabel(key),
        onDevice: rows.filter(r => !r.voice.requiresNetwork).sort(byLabel),
        network: rows.filter(r => r.voice.requiresNetwork).sort(byLabel),
      };
    });
  });
};

export const systemLanguageOptions = (
  voices: Voice[],
): SystemLanguageOption[] => {
  const subtags = new Set(
    voices.map(voice => primaryLanguage(voice.language ?? '')).filter(Boolean),
  );
  return [...subtags]
    .map(subtag => ({
      value: subtag,
      label: `${languageName(subtag)} (${subtag.toUpperCase()})`,
    }))
    .sort(byLabel);
};
