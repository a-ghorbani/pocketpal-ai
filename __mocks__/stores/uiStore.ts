export class UIStore {
  static readonly GROUP_KEYS = {
    READY_TO_USE: 'ready_to_use',
    AVAILABLE_TO_DOWNLOAD: 'available_to_download',
  } as const;
}

export const mockUiStore = {
  colorScheme: 'light',
  autoNavigatetoChat: false,
  pageStates: {
    modelsScreen: {
      filters: [],
      expandedGroups: {
        [UIStore.GROUP_KEYS.READY_TO_USE]: true,
      },
    },
  },
  setValue: jest.fn(),
  displayMemUsage: false,
  setAutoNavigateToChat: jest.fn(),
  setColorScheme: jest.fn(),
  setDisplayMemUsage: jest.fn(),
};
