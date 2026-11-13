import {I18nManager, Platform, Settings} from 'react-native';

import {getPhoneLocale} from '../phoneLocale';

jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: {get: jest.fn()},
}));

describe('getPhoneLocale', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('reads the Android locale identifier', () => {
    Platform.OS = 'android';
    jest.spyOn(I18nManager, 'getConstants').mockReturnValue({
      isRTL: false,
      doLeftAndRightSwapInRTL: true,
      localeIdentifier: 'zh_CN_#Hans',
    });
    expect(getPhoneLocale()).toBe('zh_CN_#Hans');
  });

  it("reads the first of iOS's preferred languages", () => {
    Platform.OS = 'ios';
    jest
      .spyOn(Settings, 'get')
      .mockImplementation(key =>
        key === 'AppleLanguages' ? ['zh-Hans-CN', 'en-US'] : undefined,
      );
    expect(getPhoneLocale()).toBe('zh-Hans-CN');
  });

  it('is undefined when the read is empty or throws', () => {
    Platform.OS = 'android';
    const spy = jest.spyOn(I18nManager, 'getConstants');
    spy.mockReturnValue({
      isRTL: false,
      doLeftAndRightSwapInRTL: true,
      localeIdentifier: '',
    });
    expect(getPhoneLocale()).toBeUndefined();
    spy.mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(getPhoneLocale()).toBeUndefined();
  });

  it('is undefined when iOS has no preferred languages', () => {
    Platform.OS = 'ios';
    jest.spyOn(Settings, 'get').mockReturnValue(undefined);
    expect(getPhoneLocale()).toBeUndefined();
  });
});
