/**
 * Element selectors for PocketPal E2E tests
 * Uses accessibility labels and testIDs for cross-platform compatibility
 */

const isAndroid = () => driver.isAndroid;

// Helper to create cross-platform selectors
const byTestId = (testId) => {
  if (isAndroid()) {
    // Android: try content-desc first, then resource-id
    return `//*[@content-desc="${testId}" or contains(@resource-id, "${testId}")]`;
  }
  // iOS: use accessibility identifier
  return `~${testId}`;
};

const byText = (text) => {
  if (isAndroid()) {
    return `//*[@text="${text}" or @content-desc="${text}"]`;
  }
  return `-ios predicate string:label == "${text}" OR value == "${text}"`;
};

const byPartialText = (text) => {
  if (isAndroid()) {
    return `//*[contains(@text, "${text}") or contains(@content-desc, "${text}")]`;
  }
  return `-ios predicate string:label CONTAINS "${text}" OR value CONTAINS "${text}"`;
};

module.exports = {
  // Navigation
  drawer: {
    modelsTab: byText('Models'),
    chatTab: byText('Chat'),
  },

  // Models Screen
  models: {
    flatList: byTestId('flat-list'),
    fabGroup: byTestId('fab-group'),
    hfFab: byTestId('hf-fab'),
    localFab: byTestId('local-fab'),
  },

  // HuggingFace Search
  hfSearch: {
    view: byTestId('hf-model-search-view'),
    searchInput: byTestId('search-input'),
    authorFilterButton: byTestId('filter-button-author'),
    authorFilterInput: byTestId('author-filter-input'),
    modelItem: (modelId) => byTestId(`hf-model-item-${modelId}`),
    modelItemByText: (author, name) => byPartialText(`${author}`),
  },

  // Model File Card (in details view)
  modelFile: {
    card: (filename) => byTestId(`model-file-card-${filename}`),
    downloadButton: byTestId('download-button'),
    cancelButton: byTestId('cancel-button'),
    bookmarkButton: byTestId('bookmark-button'),
  },

  // Model Card (in models list)
  modelCard: {
    downloadButton: byTestId('download-button'),
    loadButton: byTestId('load-button'),
    offloadButton: byTestId('offload-button'),
    settingsButton: byTestId('settings-button'),
    deleteButton: byTestId('delete-button'),
    expandButton: byTestId('expand-details-button'),
    downloadProgress: byTestId('download-progress-bar'),
  },

  // Chat Screen
  chat: {
    input: byTestId('chat-input'),
    sendButton: byTestId('send-button'),
  },

  // Common
  common: {
    backButton: byTestId('back-button'),
  },

  // Helper functions
  byTestId,
  byText,
  byPartialText,
};
