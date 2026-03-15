// Mock for completionSettingsVersions.ts

export const CURRENT_COMPLETION_SETTINGS_VERSION = 3;

export const defaultCompletionParams = {
  // App-specific properties
  version: CURRENT_COMPLETION_SETTINGS_VERSION,
  include_thinking_in_context: true,
  enable_thinking: true,

  // llama.rn API properties
  prompt: '',
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
  stop: ['</s>'],
};

export function migrateCompletionSettings(settings) {
  // Clone the settings to avoid modifying the original
  const migratedSettings = {...settings};

  // If no version is specified, assume it's the initial version (0)
  if (migratedSettings.version === undefined) {
    migratedSettings.version = 0;
  }

  // Apply migrations sequentially
  if (migratedSettings.version < 1) {
    // Migration to version 1: Add include_thinking_in_context
    migratedSettings.include_thinking_in_context =
      defaultCompletionParams.include_thinking_in_context;
    migratedSettings.version = 1;
  }

  if (migratedSettings.version < 2) {
    // Migration to version 2: (jinja parameter removed, no-op)
    delete migratedSettings.jinja;
    migratedSettings.version = 2;
  }

  if (migratedSettings.version < 3) {
    // Migration to version 3: Add enable_thinking parameter
    migratedSettings.enable_thinking = defaultCompletionParams.enable_thinking;
    migratedSettings.version = 3;
  }

  return migratedSettings;
}
