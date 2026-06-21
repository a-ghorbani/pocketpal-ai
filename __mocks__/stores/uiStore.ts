import {l10n, supportedLanguages} from '../../src/locales';

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
  supportedLanguages: [...supportedLanguages],
  l10n: l10n.en,
  setValue: jest.fn(),
  displayMemUsage: false,
  iOSBackgroundDownloading: true,
  setAutoNavigateToChat: jest.fn(),
  setColorScheme: jest.fn(),
  setDisplayMemUsage: jest.fn(),
  setiOSBackgroundDownloading: jest.fn(),
  setBenchmarkShareDialogPreference: jest.fn(),
  showError: jest.fn(),
  setChatWarning: jest.fn(),
  clearChatWarning: jest.fn(),
  toolCompatWarnedModels: [] as string[],
  hasWarnedToolCompat: jest.fn(() => false),
  markToolCompatWarned: jest.fn(),
  hasCompletedOnboarding: true,
  onboardingTopicsSnapshot: [] as string[],
  onboardingState: {
    currentStep: 1 as 1 | 2 | 3 | 4 | 5 | 6,
    selectedTopic: null as string | null,
    selectedModelId: null as string | null,
  },
  setOnboardingStep: jest.fn(),
  setOnboardingTopic: jest.fn(),
  setOnboardingModelId: jest.fn(),
  completeOnboarding: jest.fn(),
  resetOnboarding: jest.fn(),
  replayOnboarding: jest.fn(),
  dismissedDownloadIds: [] as string[],
  isDownloadBannerDismissed: jest.fn(() => false),
  dismissDownloadBanner: jest.fn(),
  clearDownloadBannerDismissal: jest.fn(),
};
