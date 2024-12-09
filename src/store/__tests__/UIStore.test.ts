import {UIStore, uiStore} from '../UIStore';

jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: jest.fn(() => 'light'),
}));

describe('UIStore', () => {
  beforeEach(() => {
    uiStore.setColorScheme('light');
    uiStore.setAutoNavigateToChat(true);
    uiStore.setDisplayMemUsage(false);
    uiStore.setValue('modelsScreen', 'filters', []);
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
});
