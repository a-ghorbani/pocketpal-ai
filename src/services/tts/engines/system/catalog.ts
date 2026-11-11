import type {Voice} from '../../types';

export type SystemVoiceRow = {voice: Voice; label: string};

export type SystemVoiceSection = {
  key: string;
  title: string;
  onDevice: SystemVoiceRow[];
  network: SystemVoiceRow[];
};

const LEGACY_LANGUAGE_CODES: Record<string, string> = {
  iw: 'he',
  in: 'id',
  ji: 'yi',
};

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

const collator = new Intl.Collator(undefined, {numeric: true});

const byName = (a: SystemVoiceRow, b: SystemVoiceRow) =>
  collator.compare(a.label, b.label);

export const systemSections = (voices: Voice[]): SystemVoiceSection[] => {
  const sections = new Map<string, SystemVoiceSection>();
  for (const voice of voices) {
    const key = localeKey(voice.language ?? '');
    let section = sections.get(key);
    if (!section) {
      section = {key, title: key, onDevice: [], network: []};
      sections.set(key, section);
    }
    const row = {voice, label: voice.name};
    (voice.requiresNetwork ? section.network : section.onDevice).push(row);
  }
  return [...sections.values()].map(section => ({
    ...section,
    onDevice: section.onDevice.sort(byName),
    network: section.network.sort(byName),
  }));
};
