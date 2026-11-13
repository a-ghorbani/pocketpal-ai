import type {Voice} from '../../../types';
import {
  cantoneseUnderZh,
  languageLabel,
  languageName,
  localeKey,
  primaryLanguage,
  systemLanguageOptions,
  systemPhoneLocale,
  systemSections,
  systemShortLabel,
  systemShownLanguages,
} from '../catalog';

const voice = (
  id: string,
  language: string,
  extra: Partial<Voice> = {},
): Voice => ({id, name: id, engine: 'system', language, ...extra});

describe('localeKey', () => {
  it.each([
    ['zh_CN_#Hans', 'zh-cn'],
    ['zh-Hans-CN', 'zh-cn'],
    ['zh-TW', 'zh-tw'],
    ['en_US', 'en-us'],
    ['iw_IL', 'he-il'],
    ['in_ID', 'id-id'],
    ['zh__#Hans', 'zh'],
    ['ar-001', 'ar-001'],
    ['en-US-u-ca-gregory', 'en-us'],
    ['en__#u-fw-mon-mu-celsius', 'en'],
    ['en-u-ca-gregory', 'en'],
    ['de-x-private', 'de'],
    ['zh_Hant', 'zh'],
    ['', ''],
  ])('%s → %s', (tag, expected) => {
    expect(localeKey(tag)).toBe(expected);
  });

  it('takes the primary language after normalising', () => {
    expect(primaryLanguage('iw_IL')).toBe('he');
    expect(primaryLanguage('yue-HK')).toBe('yue');
  });
});

describe('languageLabel and languageName', () => {
  it('shows the endonym with the region code, isolated', () => {
    expect(languageLabel('en-US')).toBe('⁨English⁩ (US)');
    expect(languageLabel('zh_CN_#Hans')).toBe('⁨中文⁩ (CN)');
    expect(languageLabel('de')).toBe('⁨Deutsch⁩');
  });

  it('keeps a right-to-left endonym isolated from its region', () => {
    expect(languageLabel('ar-SA')).toBe('⁨العربية⁩ (SA)');
    expect(languageName('ar')).toBe('⁨العربية⁩');
  });

  it('falls back to the raw tag for an unlisted language', () => {
    expect(languageLabel('xx-YY')).toBe('xx-YY');
    expect(languageName('xx')).toBe('xx');
  });
});

describe('systemShortLabel', () => {
  it('strips the language prefix of a numbered name', () => {
    const v = voice('en-us-x-sfg-local', 'en-US', {
      name: `${languageLabel('en-US')} · Voice 2 · sfg`,
    });
    expect(systemShortLabel(v)).toBe('Voice 2 · sfg');
  });

  it('keeps any other name whole', () => {
    expect(systemShortLabel(voice('ava', 'en-US', {name: 'Ava'}))).toBe('Ava');
  });
});

describe('systemShownLanguages', () => {
  it('puts the phone language first, then the app language', () => {
    expect(
      systemShownLanguages({
        phoneLocale: 'zh_CN_#Hans',
        appLanguage: 'en',
        cantoneseUnderZh: false,
      }),
    ).toEqual(['zh', 'en']);
  });

  it('collapses duplicates', () => {
    expect(
      systemShownLanguages({
        phoneLocale: 'en_GB',
        appLanguage: 'en',
        cantoneseUnderZh: false,
      }),
    ).toEqual(['en']);
  });

  it("adds the current system voice's language", () => {
    expect(
      systemShownLanguages({
        phoneLocale: 'en_US',
        appLanguage: 'en',
        currentVoice: voice('de-de-x-deb-local', 'de-DE'),
        cantoneseUnderZh: false,
      }),
    ).toEqual(['en', 'de']);
  });

  it("ignores a neural voice's language", () => {
    expect(
      systemShownLanguages({
        appLanguage: 'en',
        currentVoice: {id: 'x', name: 'X', engine: 'kokoro', language: 'ja'},
        cantoneseUnderZh: false,
      }),
    ).toEqual(['en']);
  });

  it('replaces the set with a picked language', () => {
    expect(
      systemShownLanguages({
        phoneLocale: 'zh_CN',
        appLanguage: 'en',
        currentVoice: voice('de-de-x-deb-local', 'de-DE'),
        pickedLanguage: 'fr',
        cantoneseUnderZh: false,
      }),
    ).toEqual(['fr']);
  });

  it('skips a missing phone language', () => {
    expect(
      systemShownLanguages({appLanguage: 'zh_Hant', cantoneseUnderZh: false}),
    ).toEqual(['zh']);
  });
});

describe('Cantonese', () => {
  const hongKong = voice('com.apple.voice.compact.zh-HK.Sinji', 'zh-HK');
  const mainland = voice('com.apple.voice.compact.zh-CN.Tingting', 'zh-CN');
  const cantonese = voice('yue-hk-x-yuc-local', 'yue-HK');

  const shown = (
    phoneLocale: string,
    voices: Voice[],
    canInstallVoices: boolean,
  ) => {
    const underZh = cantoneseUnderZh(voices, canInstallVoices);
    const locale = systemPhoneLocale(phoneLocale, underZh);
    const languages = systemShownLanguages({
      phoneLocale: locale,
      appLanguage: 'en',
      cantoneseUnderZh: underZh,
    });
    return {
      languages,
      sections: systemSections(voices, languages, locale).map(s => s.key),
    };
  };

  it.each(['zh-Hant-HK', 'zh_MO'])(
    'adds Cantonese after Chinese on a %s phone that can install voices',
    phoneLocale => {
      expect(shown(phoneLocale, [mainland], true).languages).toEqual([
        'zh',
        'yue',
        'en',
      ]);
    },
  );

  it('files Cantonese under Chinese when the phone has no yue voice and no installer', () => {
    expect(shown('zh-Hant-HK', [mainland, hongKong], false)).toEqual({
      languages: ['zh', 'en'],
      sections: ['zh-hk', 'zh-cn', 'en'],
    });
  });

  it('keeps Cantonese when the phone has a yue voice', () => {
    expect(shown('zh-Hant-HK', [hongKong, cantonese], false).languages).toEqual(
      ['zh', 'yue', 'en'],
    );
  });

  it('keeps Chinese without Cantonese on a Taiwan phone', () => {
    expect(shown('zh_TW', [mainland], true).languages).toEqual(['zh', 'en']);
  });

  it('reads a Cantonese phone as Chinese when Cantonese is under Chinese', () => {
    expect(systemPhoneLocale('yue-Hant-HK', true)).toBe('zh-HK');
    expect(systemPhoneLocale('yue-Hant', true)).toBe('zh-HK');
    expect(systemPhoneLocale('yue-Hant-MO', true)).toBe('zh-MO');
    expect(systemPhoneLocale('yue-Hant-HK', false)).toBe('yue-Hant-HK');
    expect(systemPhoneLocale('zh-Hant-HK', true)).toBe('zh-Hant-HK');
    expect(systemPhoneLocale(undefined, true)).toBeUndefined();
    expect(shown('yue-Hant-HK', [mainland, hongKong], false)).toEqual({
      languages: ['zh', 'en'],
      sections: ['zh-hk', 'zh-cn', 'en'],
    });
  });
});

describe('systemSections', () => {
  const catalog = [
    voice('en-us-x-sfg-network', 'en-US', {
      name: 'Voice 2 · sfg',
      requiresNetwork: true,
    }),
    voice('en-us-x-sfg-local', 'en-US', {name: 'Voice 2 · sfg'}),
    voice('en-us-x-iob-local', 'en-US', {name: 'Voice 10 · iob'}),
    voice('en-gb-x-gba-local', 'en-GB', {name: 'Voice 1 · gba'}),
    voice('cmn-tw-x-ctc-local', 'zh-TW', {name: 'Voice 1 · ctc'}),
    voice('cmn-cn-x-ccc-local', 'zh-CN', {name: 'Voice 1 · ccc'}),
    voice('de-de-x-deb-local', 'de-DE', {name: 'Voice 1 · deb'}),
  ];

  const shape = (sections: ReturnType<typeof systemSections>) =>
    sections.map(s => ({
      key: s.key,
      onDevice: s.onDevice.map(r => r.voice.id),
      network: s.network.map(r => r.voice.id),
    }));

  it('orders sections by shown language, the phone region first', () => {
    expect(
      systemSections(catalog, ['zh', 'en'], 'zh_TW').map(s => s.key),
    ).toEqual(['zh-tw', 'zh-cn', 'en-gb', 'en-us']);
    expect(systemSections(catalog, ['en'], 'en_US').map(s => s.key)).toEqual([
      'en-us',
      'en-gb',
    ]);
  });

  it('splits on-device from network voices, each by name with numbers in order', () => {
    expect(shape(systemSections(catalog, ['en'], 'en_US'))[0]).toEqual({
      key: 'en-us',
      onDevice: ['en-us-x-sfg-local', 'en-us-x-iob-local'],
      network: ['en-us-x-sfg-network'],
    });
  });

  it('titles a section with its language label and labels rows short', () => {
    const [section] = systemSections(
      [
        voice('cmn-cn-x-ccc-local', 'zh-CN', {
          name: `${languageLabel('zh-CN')} · Voice 1 · ccc`,
        }),
      ],
      ['zh'],
    );
    expect(section!.title).toBe(languageLabel('zh-CN'));
    expect(section!.onDevice[0]!.label).toBe('Voice 1 · ccc');
  });

  it('gives a shown language with no voice one empty section', () => {
    expect(shape(systemSections(catalog, ['ja', 'de']))).toEqual([
      {key: 'ja', onDevice: [], network: []},
      {key: 'de-de', onDevice: ['de-de-x-deb-local'], network: []},
    ]);
    expect(systemSections([], ['ja'])[0]!.title).toBe(languageName('ja'));
  });

  it('never puts a voice without the flag in the network block', () => {
    const sections = systemSections(
      [voice('Samantha', 'en-US'), voice('Ava', 'en-US')],
      ['en'],
    );
    expect(sections[0]!.network).toEqual([]);
    expect(sections[0]!.onDevice.map(r => r.voice.id)).toEqual([
      'Ava',
      'Samantha',
    ]);
  });
});

describe('systemLanguageOptions', () => {
  it('lists each primary language once, labelled with its code', () => {
    expect(
      systemLanguageOptions([
        voice('a', 'en-US'),
        voice('b', 'en-GB'),
        voice('c', 'de-DE'),
        voice('d', 'zh_CN_#Hans'),
      ]),
    ).toEqual([
      {value: 'de', label: `${languageName('de')} (DE)`},
      {value: 'en', label: `${languageName('en')} (EN)`},
      {value: 'zh', label: `${languageName('zh')} (ZH)`},
    ]);
  });
});
