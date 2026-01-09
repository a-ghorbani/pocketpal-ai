/**
 * Element selectors for PocketPal E2E tests
 *
 * Selector strategies:
 * - byTestId: Primary strategy - uses ~testID (iOS) / XPath resource-id (Android)
 * - byText: Match by exact text label
 * - byPartialText: Match by partial text content
 * - byAccessibilityLabel: Match by accessibility label
 *
 * Selectors use getters for lazy evaluation since driver is only available at runtime.
 */

// WebdriverIO provides driver as a global at runtime
declare const driver: WebdriverIO.Browser;

/**
 * Check if running on Android
 */
export const isAndroid = (): boolean => driver.isAndroid;

/**
 * Create selector by testID (preferred - works cross-platform)
 */
export const byTestId = (testId: string): string => {
  if (isAndroid()) {
    return `//*[contains(@resource-id, "${testId}")]`;
  }
  return `~${testId}`;
};

/**
 * Create selector by text content (fallback for elements without testID)
 */
export const byText = (text: string): string => {
  if (isAndroid()) {
    return `//*[@text="${text}" or @content-desc="${text}"]`;
  }
  return `-ios predicate string:label == "${text}" OR value == "${text}"`;
};

/**
 * Create selector by partial text match
 */
export const byPartialText = (text: string): string => {
  if (isAndroid()) {
    return `//*[contains(@text, "${text}") or contains(@content-desc, "${text}")]`;
  }
  return `-ios predicate string:label CONTAINS "${text}" OR value CONTAINS "${text}"`;
};

/**
 * Create selector by accessibilityLabel (use sparingly - testID is preferred)
 */
export const byAccessibilityLabel = (label: string): string => {
  if (isAndroid()) {
    return `~${label}`;
  }
  return `-ios predicate string:label CONTAINS "${label}"`;
};

/**
 * Create selector for native text elements (TextView on Android, StaticText on iOS)
 * Useful for extracting rendered text from React Native components
 */
export const nativeTextElement = (): string => {
  if (isAndroid()) {
    return 'android.widget.TextView';
  }
  return '-ios class chain:**/XCUIElementTypeStaticText';
};

/**
 * Predefined selectors organized by screen/feature
 * All use getters for lazy evaluation at runtime
 */
export const Selectors = {
  // Navigation drawer - use text labels for reliable tapping
  // react-native-paper Drawer.Item doesn't always respond to testID taps
  drawer: {
    get chatTab(): string {
      return byText('Chat');
    },
    get modelsTab(): string {
      return byText('Models');
    },
    get palsTab(): string {
      return byText('Pals');
    },
    get benchmarkTab(): string {
      return byText('Benchmark');
    },
    get settingsTab(): string {
      return byText('Settings');
    },
  },

  // Chat screen
  chat: {
    get input(): string {
      return byTestId('chat-input');
    },
    get sendButton(): string {
      return byTestId('send-button');
    },
    get menuButton(): string {
      return byTestId('menu-button');
    },
    get stopButton(): string {
      return byTestId('stop-button');
    },
    get attachmentButton(): string {
      return byTestId('attachment-button');
    },
    get resetButton(): string {
      return byTestId('reset-button');
    },
    get messageTiming(): string {
      return byTestId('message-timing');
    },
    get userMessage(): string {
      return byTestId('user-message');
    },
    get aiMessage(): string {
      return byTestId('ai-message');
    },
    get markdownContent(): string {
      return byTestId('markdown-content');
    },
  },

  // Models screen
  models: {
    get screen(): string {
      return byTestId('models-screen');
    },
    // FAB.Group - use testID
    get fabGroup(): string {
      return byTestId('fab-group');
    },
    get fabGroupClose(): string {
      return byAccessibilityLabel('Close menu');
    },
    // FAB actions - use accessibilityLabel (react-native-paper uses label as accessibility label)
    get hfFab(): string {
      return byAccessibilityLabel('Add from Hugging Face');
    },
    get localFab(): string {
      return byAccessibilityLabel('Add Local Model');
    },
    get flatList(): string {
      return byTestId('flat-list');
    },
    get menuButton(): string {
      return byTestId('menu-button');
    },
    // Dynamic: model accordion by type
    modelAccordion: (type: string): string =>
      byTestId(`model-accordion-${type}`),
  },

  // HuggingFace search sheet
  hfSearch: {
    get view(): string {
      return byTestId('hf-model-search-view');
    },
    get searchInput(): string {
      // TextInput inside @gorhom/bottom-sheet may not expose testID properly
      // Use accessibilityLabel which is set to "Search models"
      if (isAndroid()) {
        return byTestId('search-input');
      }
      // iOS: Use accessibility label
      return byAccessibilityLabel('Search models');
    },
    get searchBar(): string {
      return byTestId('enhanced-search-bar');
    },
    get authorFilter(): string {
      return byTestId('filter-button-author');
    },
    get sortFilter(): string {
      return byTestId('filter-button-sort');
    },
    // Dynamic: model item by ID
    modelItem: (id: string): string => byTestId(`hf-model-item-${id}`),
    // Partial match for finding models by text content
    modelItemByText: (text: string): string => byPartialText(text),
  },

  // Model details/file cards
  modelDetails: {
    // Dynamic: file card by filename
    fileCard: (filename?: string): string => {
      if (filename) {
        return byTestId(`model-file-card-${filename}`);
      }
      // Match any model-file-card
      if (isAndroid()) {
        return `//*[contains(@resource-id, "model-file-card")]`;
      }
      return `-ios predicate string:name CONTAINS "model-file-card"`;
    },
    get downloadButton(): string {
      return byTestId('download-button');
    },
    get cancelButton(): string {
      return byTestId('cancel-button');
    },
    get bookmarkButton(): string {
      return byTestId('bookmark-button');
    },
  },

  // Model card actions
  modelCard: {
    get downloadButton(): string {
      return byTestId('download-button');
    },
    get cancelButton(): string {
      return byTestId('cancel-button');
    },
    get settingsButton(): string {
      return byTestId('settings-button');
    },
    get deleteButton(): string {
      return byTestId('delete-button');
    },
    get loadButton(): string {
      return byTestId('load-button');
    },
    get offloadButton(): string {
      return byTestId('offload-button');
    },
    get expandDetailsButton(): string {
      return byTestId('expand-details-button');
    },
    get downloadProgressBar(): string {
      return byTestId('download-progress-bar');
    },
  },

  // Settings screen
  settings: {
    get container(): string {
      return byTestId('settings-container');
    },
    get darkModeSwitch(): string {
      return byTestId('dark-mode-switch');
    },
    get gpuLayersSlider(): string {
      return byTestId('gpu-layers-slider');
    },
    get contextSizeInput(): string {
      return byTestId('context-size-input');
    },
  },

  // Common dialogs and sheets
  common: {
    get sheetHandle(): string {
      return byTestId('sheet-handle');
    },
    get sheetCloseButton(): string {
      return byTestId('sheet-close-button');
    },
    get resetDialog(): string {
      return byTestId('reset-dialog');
    },
    get downloadErrorDialog(): string {
      return byTestId('download-error-dialog');
    },
    get errorSnackbar(): string {
      return byTestId('error-snackbar');
    },
  },

  // Benchmark screen
  benchmark: {
    get startTestButton(): string {
      return byTestId('start-test-button');
    },
    get advancedSettingsButton(): string {
      return byTestId('advanced-settings-button');
    },
    get clearAllButton(): string {
      return byTestId('clear-all-button');
    },
  },
};
