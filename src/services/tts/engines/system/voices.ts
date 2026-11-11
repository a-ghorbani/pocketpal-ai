import {Platform} from 'react-native';
import Speech from '@pocketpalai/react-native-speech';
import type {VoiceProps} from '@pocketpalai/react-native-speech';

import {t} from '../../../../locales';
import type {Voice} from '../../types';

import {languageLabel, localeKey} from './catalog';

/** Android-only fields; `undefined` means the engine did not say. */
type OsVoice = VoiceProps & {
  networkConnectionRequired?: boolean;
  notInstalled?: boolean;
};

export type SystemVoiceCopy = {
  systemVoiceNumber: string;
  systemQualityEnhanced: string;
};

const GOOGLE_VOICE_NAME =
  /^[a-z]{2,3}-[a-z0-9]{2,3}-x-([a-z]+)-(local|network)$/;
const ALIAS_SUFFIX = '-language';

const localeOf = (voice: OsVoice) => localeKey(voice.language ?? '');

/** Speaker codes per locale, over the full catalog so an install never renumbers. */
const speakerCodes = (voices: OsVoice[]): Map<string, string[]> => {
  const codes = new Map<string, Set<string>>();
  for (const voice of voices) {
    const code = GOOGLE_VOICE_NAME.exec(voice.name ?? '')?.[1];
    if (code) {
      const key = localeOf(voice);
      codes.set(key, (codes.get(key) ?? new Set()).add(code));
    }
  }
  return new Map(
    [...codes].map(([key, set]) => [key, [...set].sort()] as const),
  );
};

const readableName = (
  voice: OsVoice,
  codes: Map<string, string[]>,
  copy: SystemVoiceCopy,
): string => {
  const name = voice.name ?? voice.identifier;
  const code = GOOGLE_VOICE_NAME.exec(name)?.[1];
  if (code) {
    const number = (codes.get(localeOf(voice)) ?? []).indexOf(code) + 1;
    const speaker = t(copy.systemVoiceNumber, {number});
    return `${languageLabel(voice.language)} · ${speaker} · ${code}`;
  }
  if (Platform.OS === 'ios' && voice.quality && voice.quality !== 'Default') {
    const quality =
      voice.quality === 'Enhanced'
        ? copy.systemQualityEnhanced
        : String(voice.quality);
    return `${name} (${quality})`;
  }
  return name;
};

const withoutRedundantAliases = (voices: OsVoice[]): OsVoice[] => {
  const localesWithVoices = new Set(
    voices.filter(v => !v.identifier.endsWith(ALIAS_SUFFIX)).map(localeOf),
  );
  return voices.filter(
    v =>
      !v.identifier.endsWith(ALIAS_SUFFIX) ||
      !localesWithVoices.has(localeOf(v)),
  );
};

const withCollisionSuffixes = (voices: Voice[]): Voice[] => {
  const groups = new Map<string, Voice[]>();
  for (const voice of voices) {
    const key = [
      localeKey(voice.language ?? ''),
      voice.name,
      voice.requiresNetwork === true,
    ].join('\u0000');
    groups.set(key, [...(groups.get(key) ?? []), voice]);
  }
  const suffixes = new Map<string, number>();
  for (const group of groups.values()) {
    [...group]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .forEach((voice, index) => {
        if (index > 0) {
          suffixes.set(voice.id, index + 1);
        }
      });
  }
  return voices.map(voice => {
    const suffix = suffixes.get(voice.id);
    return suffix ? {...voice, name: `${voice.name} · ${suffix}`} : voice;
  });
};

/**
 * The OS voice catalog as the picker shows it. Android speaks with the last
 * voice whose name matches the id, so a repeated id keeps its last entry.
 */
export const getSystemVoices = async (
  copy: SystemVoiceCopy,
): Promise<Voice[]> => {
  const osVoices: OsVoice[] = await Speech.getAvailableVoices();
  const codes = speakerCodes(osVoices);
  const lastById = new Map<string, OsVoice>();
  for (const voice of osVoices) {
    lastById.set(voice.identifier, voice);
  }
  const installed = [...lastById.values()].filter(v => v.notInstalled !== true);
  return withCollisionSuffixes(
    withoutRedundantAliases(installed).map(voice => ({
      id: voice.identifier,
      name: readableName(voice, codes, copy),
      engine: 'system',
      language: voice.language,
      ...(voice.networkConnectionRequired === true
        ? {requiresNetwork: true}
        : {}),
    })),
  );
};
