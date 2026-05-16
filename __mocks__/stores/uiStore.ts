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
  messageRenderingSettings: {
    renderMarkdown: true,
    renderLatex: true,
    renderTables: true,
    showThinkingBlocks: true,
    collapseThinkingByDefault: true,
    hideModelTemplateTokens: true,
    defaultCopyMode: 'clean',
    wrapCodeLines: false,
    useSyntaxHighlighting: true,
    useCompactTables: false,
  },
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
  setAutoNavigateToChat: jest.fn(),
  setColorScheme: jest.fn(),
  setDisplayMemUsage: jest.fn(),
  setMessageRenderingSetting: jest.fn(),
  resetMessageRenderingSettings: jest.fn(),
  setBenchmarkShareDialogPreference: jest.fn(),
  showError: jest.fn(),
};
