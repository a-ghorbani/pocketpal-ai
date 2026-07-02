/**
 * UserSettings Model
 *
 * Represents user preferences and settings.
 * Synced across devices via Firestore.
 *
 * @phase Phase 1 - Data Model
 */

/**
 * Theme type
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Available languages
 */
export type Language = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de';

/**
 * UserSettings - User preferences and configuration
 *
 * Properties:
 * - theme: UI theme preference
 * - language: App language
 * - defaultModel: Default AI model ID
 * - updatedAt: Last update timestamp
 * - _dirty: Local-only flag for sync tracking
 */
export interface UserSettings {
  /**
   * Unique settings ID (usually 'default')
   */
  id: string;

  /**
   * UI theme preference
   * @default 'system'
   */
  theme: Theme;

  /**
   * App language
   * @default 'en'
   */
  language: Language;

  /**
   * Default AI model ID
   */
  defaultModel?: string;

  /**
   * Whether to show memory usage in UI
   * @default false
   */
  displayMemUsage: boolean;

  /**
   * Whether to auto-navigate to chat after loading model
   * @default true
   */
  autoNavigateToChat: boolean;

  /**
   * Custom system prompt (global override)
   */
  globalSystemPrompt?: string;

  /**
   * Last update timestamp (Unix milliseconds)
   * Used for sync conflict resolution
   */
  updatedAt: number;

  /**
   * Sync dirty flag (local only)
   * If true, settings need to be synced to remote
   */
  _dirty?: boolean;
}

/**
 * Default user settings
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  id: 'default',
  theme: 'system',
  language: 'en',
  displayMemUsage: false,
  autoNavigateToChat: true,
  updatedAt: Date.now(),
  _dirty: false,
};

/**
 * Create default user settings
 * @returns UserSettings - Default settings object
 */
export function createDefaultUserSettings(): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    id: 'default',
    updatedAt: Date.now(),
    _dirty: true,
  };
}

/**
 * Update user settings (partial update)
 * @param settings - Current settings
 * @param updates - Partial updates
 * @returns UserSettings - Updated settings
 */
export function updateUserSettings(
  settings: UserSettings,
  updates: Partial<UserSettings>
): UserSettings {
  return {
    ...settings,
    ...updates,
    updatedAt: Date.now(),
    _dirty: true,
  };
}

/**
 * Mark settings as dirty (needs sync)
 * @param settings - Settings to mark
 * @returns UserSettings - Updated settings
 */
export function markSettingsDirty(settings: UserSettings): UserSettings {
  return {
    ...settings,
    _dirty: true,
  };
}

/**
 * Mark settings as clean (sync complete)
 * @param settings - Settings to mark
 * @returns UserSettings - Updated settings
 */
export function markSettingsClean(settings: UserSettings): UserSettings {
  return {
    ...settings,
    _dirty: false,
  };
}

/**
 * Validate theme value
 * @param theme - Theme to validate
 * @returns Theme - Valid theme (falls back to 'system')
 */
export function validateTheme(theme: string): Theme {
  const validThemes: Theme[] = ['light', 'dark', 'system'];
  return validThemes.includes(theme as Theme) ? (theme as Theme) : 'system';
}

/**
 * Validate language value
 * @param language - Language to validate
 * @returns Language - Valid language (falls back to 'en')
 */
export function validateLanguage(language: string): Language {
  const validLanguages: Language[] = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'];
  return validLanguages.includes(language as Language) ? (language as Language) : 'en';
}
