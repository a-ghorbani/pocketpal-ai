import {l10n} from '../../src/utils/l10n';

export class UIStore {
  static readonly GROUP_KEYS = {
    READY_TO_USE: 'ready_to_use',
    AVAILABLE_TO_DOWNLOAD: 'available_to_download',
  } as const;
}

export const mockUiStore = {
  colorScheme: 'light',
  autoNavigatetoChat: false,
  benchmarkShareDialog: {
    shouldShow: true,
  },
  pageStates: {
    modelsScreen: {
      filters: [],
      expandedGroups: {
        [UIStore.GROUP_KEYS.READY_TO_USE]: true,
      },
    },
  },
  language: 'en',
  supportedLanguages: ['en', 'ja', 'zh', 'fr'],
  l10n: l10n.en,
  setValue: jest.fn(),
  displayMemUsage: false,
  setAutoNavigateToChat: jest.fn(),
  setColorScheme: jest.fn(),
  setDisplayMemUsage: jest.fn(),
  setBenchmarkShareDialogPreference: jest.fn(),
  showError: jest.fn(),
};
