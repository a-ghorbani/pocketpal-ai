import {UIStore, uiStore} from '../UIStore';
import {l10n, supportedLanguages} from '../../locales';

jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: jest.fn(() => 'light'),
}));

describe('UIStore', () => {
  beforeEach(() => {
    uiStore.setColorScheme('light');
    uiStore.setAutoNavigateToChat(true);
    uiStore.setDisplayMemUsage(false);
    uiStore.setValue('modelsScreen', 'filters', []);
    uiStore.setLanguage('en');
  });

  it('should initialize with default values', () => {
    expect(uiStore.pageStates).toEqual({
      modelsScreen: {
        filters: [],
        expandedGroups: {
          [UIStore.GROUP_KEYS.READY_TO_USE]: true,
        },
      },
    });
    expect(uiStore.autoNavigatetoChat).toBe(true);
    expect(uiStore.colorScheme).toBe('light');
    expect(uiStore.displayMemUsage).toBe(false);
  });

  it('should set color scheme', () => {
    uiStore.setColorScheme('dark');
    expect(uiStore.colorScheme).toBe('dark');
  });

  it('should set auto navigate to chat', () => {
    uiStore.setAutoNavigateToChat(false);
    expect(uiStore.autoNavigatetoChat).toBe(false);
  });

  it('should set display memory usage', () => {
    uiStore.setDisplayMemUsage(true);
    expect(uiStore.displayMemUsage).toBe(true);
  });

  it('should set page state value correctly', () => {
    uiStore.setValue('modelsScreen', 'filters', ['ungrouped']);
    expect(uiStore.pageStates.modelsScreen.filters).toEqual(['ungrouped']);
  });

  it('should handle invalid page in setValue', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    // @ts-ignore - Testing invalid input
    uiStore.setValue('invalidPage', 'someKey', 'someValue');
    expect(consoleSpy).toHaveBeenCalledWith(
      "Page 'invalidPage' does not exist in pageStates",
    );
    consoleSpy.mockRestore();
  });

  describe('language', () => {
    it('should default to en', () => {
      expect(uiStore.language).toBe('en');
    });

    it('should set language correctly', () => {
      uiStore.setLanguage('ja');
      expect(uiStore.language).toBe('ja');
    });

    it('should fall back to en for unknown language', () => {
      // Simulate a persisted language value that is no longer supported
      // @ts-ignore - Testing invalid input
      uiStore._language = 'xx';
      expect(uiStore.language).toBe('en');
    });

    it('should return correct l10n translations for selected language', () => {
      uiStore.setLanguage('ja');
      expect(uiStore.l10n).toBe(l10n.ja);
    });

    it('should return en translations when language is en', () => {
      uiStore.setLanguage('en');
      expect(uiStore.l10n).toBe(l10n.en);
    });

    it('should return en translations when language is unknown (fallback)', () => {
      // @ts-ignore - Testing invalid input
      uiStore._language = 'xx';
      expect(uiStore.l10n).toBe(l10n.en);
    });

    it('supportedLanguages getter returns from locales registry', () => {
      expect(uiStore.supportedLanguages).toBe(supportedLanguages);
    });

    it('supportedLanguages contains all expected languages', () => {
      expect(uiStore.supportedLanguages).toEqual(['en', 'he', 'id', 'ja', 'ko', 'ms', 'ru', 'zh']);
    });
  });
});
