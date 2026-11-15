import {I18nManager, Platform, Settings} from 'react-native';

/**
 * The phone's first preferred language. Not `Intl`: on iOS Hermes reports
 * the app bundle's localization (`en`), not the phone's.
 */
export const getPhoneLocale = (): string | undefined => {
  try {
    const locale: unknown =
      Platform.OS === 'ios'
        ? Settings.get('AppleLanguages')?.[0]
        : I18nManager.getConstants().localeIdentifier;
    return typeof locale === 'string' && locale ? locale : undefined;
  } catch {
    return undefined;
  }
};
