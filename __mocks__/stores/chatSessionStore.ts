import {sessionFixtures} from '../../jest/fixtures/chatSessions';

// Mock defaultCompletionSettings to avoid circular imports
// This should match the actual defaultCompletionSettings from ChatSessionStore
export const mockDefaultCompletionSettings = {
  version: 3,
  include_thinking_in_context: true,
  n_predict: 1024,
  temperature: 0.7,
  top_k: 40,
  top_p: 0.95,
  min_p: 0.05,
  xtc_threshold: 0.1,
  xtc_probability: 0.0,
  typical_p: 1.0,
  penalty_last_n: 64,
  penalty_repeat: 1.0,
  penalty_freq: 0.0,
  penalty_present: 0.0,
  mirostat: 0,
  mirostat_tau: 5,
  mirostat_eta: 0.1,
  seed: -1,
  n_probs: 0,
  jinja: true,
  enable_thinking: true,
};

export const mockChatSessionStore = {
  sessions: sessionFixtures,
  //currentSessionMessages: [],
  activeSessionId: 'session-1',
  newChatCompletionSettings: mockDefaultCompletionSettings,
  isMigrating: false,
  migrationComplete: true,
  loadSessionList: jest.fn().mockResolvedValue(undefined),
  loadGlobalSettings: jest.fn().mockResolvedValue(undefined),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  setActiveSession: jest.fn(),
  addMessageToCurrentSession: jest.fn().mockResolvedValue(undefined),
  resetActiveSession: jest.fn(),
  updateSessionTitle: jest.fn().mockResolvedValue(undefined),
  updateSessionTitleBySessionId: jest.fn().mockResolvedValue(undefined),
  groupedSessions: {
    Today: [sessionFixtures[0]],
    Yesterday: [sessionFixtures[1]],
  },
  createNewSession: jest.fn().mockResolvedValue(undefined),
  updateMessage: jest.fn().mockResolvedValue(undefined),
  updateMessageToken: jest.fn().mockResolvedValue(undefined),
  updateSessionCompletionSettings: jest.fn().mockResolvedValue(undefined),
  applySessionSettingsToGlobal: jest.fn().mockResolvedValue(undefined),
  resetSessionSettingsToGlobal: jest.fn().mockResolvedValue(undefined),
  exitEditMode: jest.fn(),
  enterEditMode: jest.fn(),
  removeMessagesFromId: jest.fn(),
  setIsGenerating: jest.fn(),
  duplicateSession: jest.fn().mockResolvedValue(undefined),
  setNewChatCompletionSettings: jest.fn().mockResolvedValue(undefined),
  resetNewChatCompletionSettings: jest.fn().mockResolvedValue(undefined),
  setActivePal: jest.fn().mockResolvedValue(undefined),
  resolveCompletionSettings: jest
    .fn()
    .mockResolvedValue(mockDefaultCompletionSettings),
  getCurrentCompletionSettings: jest
    .fn()
    .mockResolvedValue(mockDefaultCompletionSettings),
  dateGroupNames: {
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    lastWeek: 'Last week',
    twoWeeksAgo: '2 weeks ago',
    threeWeeksAgo: '3 weeks ago',
    fourWeeksAgo: '4 weeks ago',
    lastMonth: 'Last month',
    older: 'Older',
  },
  setDateGroupNames: jest.fn(),
  initialize: jest.fn().mockResolvedValue(undefined),
};

Object.defineProperty(mockChatSessionStore, 'currentSessionMessages', {
  get: jest.fn(() => []),
  configurable: true,
});

Object.defineProperty(mockChatSessionStore, 'activePalId', {
  get: jest.fn(() => null),
  configurable: true,
});

Object.defineProperty(mockChatSessionStore, 'shouldShowHeaderDivider', {
  get: jest.fn(() => true),
  configurable: true,
});
