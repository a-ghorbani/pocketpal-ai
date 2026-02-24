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
 * Create selector targeting only static text elements (excludes buttons).
 * Useful when a text appears both in a hidden drawer button and a visible nav title.
 */
export const byStaticText = (text: string): string => {
  if (isAndroid()) {
    return `//android.widget.TextView[@text="${text}"]`;
  }
  return `-ios class chain:**/XCUIElementTypeStaticText[\`label == "${text}"\`]`;
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
 * Create selector by exact accessibilityLabel match
 * Use this for buttons with known labels like "Close menu", "Add from Hugging Face"
 */
export const byAccessibilityLabel = (label: string): string => {
  if (isAndroid()) {
    return `~${label}`;
  }
  return `~${label}`;
};

/**
 * Create selector by partial accessibilityLabel match
 * Use this when searching for elements where the label may contain additional text
 */
export const byAccessibilityLabelContains = (label: string): string => {
  if (isAndroid()) {
    return `//*[contains(@content-desc, "${label}")]`;
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
 * Create selector for native text input elements (EditText on Android, TextField on iOS)
 * Useful for finding TextInput elements that may not expose testID properly
 */
export const nativeTextInput = (): string => {
  if (isAndroid()) {
    return 'android.widget.EditText';
  }
  return '-ios class chain:**/XCUIElementTypeTextField';
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
    // The timing text is a sibling element after message-timing, not a child
    get messageTimingText(): string {
      if (isAndroid()) {
        // Android: Find TextView sibling that follows message-timing ViewGroup
        return `//*[@resource-id="message-timing"]/following-sibling::android.widget.TextView[1]`;
      }
      // iOS: Match StaticText containing timing pattern (tokens/sec)
      // Class chain doesn't support following-sibling, so we match by content
      return `-ios predicate string:type == "XCUIElementTypeStaticText" AND label CONTAINS "tokens/sec"`;
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
    /**
     * Selector for detecting inference completion.
     * Matches any element with "tokens/sec" in its accessibility label/content-desc.
     * The timing info appears in the message bubble's accessibility label when inference completes.
     */
    get inferenceComplete(): string {
      return byAccessibilityLabelContains('tokens/sec');
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
    get remoteFab(): string {
      return byAccessibilityLabel('Add Remote Model');
    },
    get manageServersFab(): string {
      return byAccessibilityLabel('Manage Servers');
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
      // With accessible={false} on the Sheet container, child testIDs are now exposed
      return byTestId('search-input');
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
    // Find model item by partial accessibilityLabel match (targets the TouchableOpacity)
    modelItemByText: (text: string): string => byAccessibilityLabelContains(text),
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
    // Dynamic: file name text element by filename
    fileName: (filename: string): string => {
      return byTestId(`model-file-name-${filename}`);
    },
    get downloadButton(): string {
      return byTestId('download-button');
    },
    // Selector for download button within a specific file card
    // Returns the button element selector to find within a file card context
    get downloadButtonElement(): string {
      if (isAndroid()) {
        return `.//android.widget.Button[contains(@resource-id, "download-button")]`;
      }
      // iOS: Use predicate string for nested element search
      return `-ios predicate string:name == "download-button"`;
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
    // Dynamic: model card by filename (e.g., 'SmolLM2-135M-Instruct-Q2_K.gguf')
    // Note: The actual model-card element has no children - use container for finding siblings
    card: (filename: string): string => byTestId(`model-card-${filename}`),
    // Model card container - contains the model card and its action buttons as siblings
    cardContainer: (filename: string): string =>
      byTestId(`model-card-${filename}-container`),
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
    // Load button element selector for use within a model card context
    get loadButtonElement(): string {
      if (isAndroid()) {
        return `.//android.widget.Button[contains(@resource-id, "load-button")]`;
      }
      // iOS: Use predicate string for nested element search
      return `-ios predicate string:name == "load-button"`;
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
    get languageSelectorButton(): string {
      return byTestId('language-selector-button');
    },
    languageOption: (lang: string): string =>
      byTestId(`language-option-${lang}`),
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

  // Native alert dialogs (React Native Alert.alert)
  // These are OS-level dialogs with platform-specific selectors
  alert: {
    // Alert container
    get container(): string {
      if (isAndroid()) {
        // Android AlertDialog
        return '//android.widget.FrameLayout[@resource-id="android:id/content"]//android.widget.ScrollView';
      }
      // iOS Alert
      return '-ios class chain:**/XCUIElementTypeAlert';
    },
    // Alert title
    get title(): string {
      if (isAndroid()) {
        return '//android.widget.TextView[@resource-id="android:id/alertTitle"]';
      }
      return '-ios class chain:**/XCUIElementTypeAlert/**/XCUIElementTypeStaticText[1]';
    },
    // Alert message
    get message(): string {
      if (isAndroid()) {
        return '//android.widget.TextView[@resource-id="android:id/message"]';
      }
      return '-ios class chain:**/XCUIElementTypeAlert/**/XCUIElementTypeStaticText[2]';
    },
    // Dynamic: alert button by text label
    button: (label: string): string => {
      if (isAndroid()) {
        // Android uses Button with text attribute
        return `//android.widget.Button[@text="${label}"]`;
      }
      // iOS uses XCUIElementTypeButton with label
      return `-ios predicate string:type == "XCUIElementTypeButton" AND label == "${label}"`;
    },
    // Common button shortcuts
    // Note: Android AlertDialog buttons are displayed in UPPERCASE
    get cancelButton(): string {
      if (isAndroid()) {
        return '//android.widget.Button[@text="CANCEL"]';
      }
      return `-ios predicate string:type == "XCUIElementTypeButton" AND label == "Cancel"`;
    },
    get continueButton(): string {
      if (isAndroid()) {
        return '//android.widget.Button[@text="CONTINUE"]';
      }
      return `-ios predicate string:type == "XCUIElementTypeButton" AND label == "Continue"`;
    },
  },

  // Thinking / generation settings
  thinking: {
    /** "Think" toggle button - when thinking is currently enabled */
    get toggleEnabled(): string {
      return byAccessibilityLabel('Disable thinking mode');
    },
    /** "Think" toggle button - when thinking is currently disabled */
    get toggleDisabled(): string {
      return byAccessibilityLabel('Enable thinking mode');
    },
    /** "Reasoning" header text inside the ThinkingBubble */
    get bubble(): string {
      return byText('Reasoning');
    },
    /** Chevron icon inside the ThinkingBubble */
    get chevronIcon(): string {
      return byTestId('chevron-icon');
    },
  },

  // Generation settings sheet
  generationSettings: {
    get completionSettings(): string {
      return byTestId('completion-settings');
    },
    /** Temperature slider's text input (testID: temperature-slider-input) */
    get temperatureInput(): string {
      return byTestId('temperature-slider-input');
    },
    /** Seed integer input (testID: seed-input) */
    get seedInput(): string {
      return byTestId('seed-input');
    },
    /** Save button (session context) */
    get saveButton(): string {
      return byText('Save');
    },
    /** Save changes button (preset context) */
    get saveChangesButton(): string {
      return byText('Save Changes');
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

  // Remote model sheet (add model from server)
  remoteModel: {
    get urlInput(): string {
      return byTestId('remote-url-input');
    },
    get nameInput(): string {
      return byTestId('remote-name-input');
    },
    get apiKeyInput(): string {
      return byTestId('remote-apikey-input');
    },
    get addModelButton(): string {
      return byTestId('add-model-button');
    },
  },

  // Server details sheet (edit/delete server)
  serverDetails: {
    get urlInput(): string {
      return byTestId('server-details-url-input');
    },
    get apiKeyInput(): string {
      return byTestId('server-details-apikey-input');
    },
    get removeButton(): string {
      return byTestId('remove-server-button');
    },
    get saveButton(): string {
      return byTestId('save-server-button');
    },
  },
};
