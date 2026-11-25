import {Platform} from 'react-native';
import Speech from '@pocketpalai/react-native-speech';
import type {VoiceProps} from '@pocketpalai/react-native-speech';

import {l10n} from '../../../../../locales';
import {languageLabel} from '../catalog';
import {getSystemVoices} from '../voices';

const android = (
  name: string,
  language: string,
  fields: Partial<VoiceProps> = {},
): VoiceProps => ({
  quality: 'Enhanced',
  name,
  identifier: name,
  language,
  networkConnectionRequired: name.endsWith('-network'),
  notInstalled: false,
  ...fields,
});

const ios = (
  identifier: string,
  name: string,
  quality: VoiceProps['quality'],
  language = 'en-US',
): VoiceProps => ({identifier, name, quality, language});

const read = async (voices: VoiceProps[]) => {
  (Speech.getAvailableVoices as jest.Mock).mockResolvedValueOnce(voices);
  return getSystemVoices(l10n.en.voiceAndSpeech);
};

const enUS = languageLabel('en-US');

describe('getSystemVoices', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  describe('Android', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('flags network voices, drops uninstalled ones and the redundant alias', async () => {
      const voices = await read([
        android('en-us-x-sfg-local', 'en-US'),
        android('en-us-x-sfg-network', 'en-US'),
        android('en-US-language', 'en-US'),
        android('en-us-x-iob-local', 'en-US', {notInstalled: true}),
      ]);

      expect(voices).toEqual([
        {
          id: 'en-us-x-sfg-local',
          name: `${enUS} · Voice 2 · sfg`,
          engine: 'system',
          language: 'en-US',
        },
        {
          id: 'en-us-x-sfg-network',
          name: `${enUS} · Voice 2 · sfg`,
          engine: 'system',
          language: 'en-US',
          requiresNetwork: true,
        },
      ]);
    });

    it('keeps an alias that is the only voice of its locale', async () => {
      const voices = await read([
        android('en-us-x-sfg-local', 'en-US'),
        android('de-DE-language', 'de-DE'),
      ]);
      expect(voices.map(v => v.id)).toEqual([
        'en-us-x-sfg-local',
        'de-DE-language',
      ]);
    });

    it('shows every voice, unlabelled, when the engine reports no fields', async () => {
      const voices = await read([
        {
          quality: 'Enhanced',
          name: 'en-us-x-sfg-network',
          identifier: 'en-us-x-sfg-network',
          language: 'en-US',
        },
        {
          quality: 'Enhanced',
          name: 'en-us-x-iob-local',
          identifier: 'en-us-x-iob-local',
          language: 'en-US',
        },
        {
          quality: 'Enhanced',
          name: 'en-US-language',
          identifier: 'en-US-language',
          language: 'en-US',
        },
      ]);
      expect(voices.map(v => v.id)).toEqual([
        'en-us-x-sfg-network',
        'en-us-x-iob-local',
      ]);
      expect(voices.some(v => v.requiresNetwork)).toBe(false);
    });

    it('keeps the last entry of a repeated id', async () => {
      const voices = await read([
        android('xiaomi-voice-1', 'zh-CN'),
        android('xiaomi-voice-1', 'zh-TW'),
      ]);
      expect(voices).toEqual([
        expect.objectContaining({id: 'xiaomi-voice-1', language: 'zh-TW'}),
      ]);
    });

    it('numbers a speaker the same before and after another voice installs', async () => {
      const before = await read([
        android('en-us-x-iob-local', 'en-US', {notInstalled: true}),
        android('en-us-x-sfg-local', 'en-US'),
      ]);
      const after = await read([
        android('en-us-x-iob-local', 'en-US'),
        android('en-us-x-sfg-local', 'en-US'),
      ]);

      expect(before.map(v => v.name)).toEqual([`${enUS} · Voice 2 · sfg`]);
      expect(after.map(v => v.name)).toEqual([
        `${enUS} · Voice 1 · iob`,
        `${enUS} · Voice 2 · sfg`,
      ]);
    });

    it('numbers speakers per locale', async () => {
      const voices = await read([
        android('en-gb-x-gbb-local', 'en-GB'),
        android('en-us-x-sfg-local', 'en-US'),
      ]);
      expect(voices.map(v => v.name)).toEqual([
        `${languageLabel('en-GB')} · Voice 1 · gbb`,
        `${enUS} · Voice 1 · sfg`,
      ]);
    });

    it('keeps an OEM name as the engine gives it', async () => {
      const voices = await read([android('Xiaomi Female', 'zh-CN')]);
      expect(voices[0]!.name).toBe('Xiaomi Female');
    });
  });

  describe('iOS', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
    });

    it('adds a non-default quality and suffixes a repeated name in id order', async () => {
      const voices = await read([
        ios('com.apple.voice.premium.en-US.Ava', 'Ava', 'Default'),
        ios('com.apple.voice.enhanced.en-US.Ava', 'Ava', 'Enhanced'),
        ios('com.apple.voice.compact.en-US.Ava', 'Ava', 'Default'),
        ios('com.apple.voice.compact.en-US.Samantha', 'Samantha', 'Default'),
      ]);

      expect(voices.map(v => [v.id, v.name])).toEqual([
        ['com.apple.voice.premium.en-US.Ava', 'Ava · 2'],
        ['com.apple.voice.enhanced.en-US.Ava', 'Ava (Enhanced)'],
        ['com.apple.voice.compact.en-US.Ava', 'Ava'],
        ['com.apple.voice.compact.en-US.Samantha', 'Samantha'],
      ]);
      expect(voices.some(v => v.requiresNetwork)).toBe(false);
    });

    it('suffixes only within a locale', async () => {
      const voices = await read([
        ios('a', 'Daniel', 'Default', 'en-GB'),
        ios('b', 'Daniel', 'Default', 'en-US'),
      ]);
      expect(voices.map(v => v.name)).toEqual(['Daniel', 'Daniel']);
    });
  });
});
