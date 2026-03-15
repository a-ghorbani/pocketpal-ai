/**
 * Completion settings version constants and migration utilities
 *
 * This file handles the versioning and migration of completion settings.
 * It contains the default completion settings and migration logic.
 *
 * When adding new settings:
 * 1. Add the setting to defaultCompletionParams
 * 2. Increment CURRENT_COMPLETION_SETTINGS_VERSION
 * 3. Add a migration step in migrateCompletionSettings to handle the new setting
 */

import {CompletionParams} from './completionTypes';

// Current version of the completion settings schema
// Increment this when adding new settings or changing existing ones
export const CURRENT_COMPLETION_SETTINGS_VERSION = 3;

/**
 * Default completion parameters used throughout the app
 */
export const defaultCompletionParams: CompletionParams = {
  // App-specific properties
  version: CURRENT_COMPLETION_SETTINGS_VERSION, // Schema version for migrations
  include_thinking_in_context: true, // Whether to include thinking parts in the context sent to the model

  // llama.rn API properties
  prompt: '',
  n_predict: 1024, // The maximum number of tokens to predict when generating text.
  temperature: 0.7, // The randomness of the generated text.
  top_k: 40, // Limit the next token selection to the K most probable tokens.
  top_p: 0.95, // Limit the next token selection to a subset of tokens with a cumulative probability above a threshold P.
  min_p: 0.05, //The minimum probability for a token to be considered, relative to the probability of the most likely token.
  xtc_threshold: 0.1, // Sets a minimum probability threshold for tokens to be removed.
  xtc_probability: 0.0, // Sets the chance for token removal (checked once on sampler start)
  typical_p: 1.0, // Enable locally typical sampling with parameter p. Default: `1.0`, which is disabled.
  penalty_last_n: 64, // Last n tokens to consider for penalizing repetition. Default: `64`, where `0` is disabled and `-1` is ctx-size.
  penalty_repeat: 1.0, // Control the repetition of token sequences in the generated text.
  penalty_freq: 0.0, // Repeat alpha frequency penalty. Default: `0.0`, which is disabled.
  penalty_present: 0.0, // Repeat alpha presence penalty. Default: `0.0`, which is disabled.
  mirostat: 0, //Enable Mirostat sampling, controlling perplexity during text generation. Default: `0`, where `0` is disabled, `1` is Mirostat, and `2` is Mirostat 2.0.
  mirostat_tau: 5, // Set the Mirostat target entropy, parameter tau. Default: `5.0`
  mirostat_eta: 0.1, // Set the Mirostat learning rate, parameter eta.  Default: `0.1`
  seed: -1,
  n_probs: 0, // If greater than 0, the response also contains the probabilities of top N tokens for each generated token given the sampling settings.
  stop: ['</s>'],
  enable_thinking: true, // Whether to enable thinking mode for compatible models
  // emit_partial_completion: true, // This is not used in the current version of llama.rn
};

/**
 * Migrates completion settings to the latest version
 * @param settings The settings object to migrate
 * @returns The migrated settings object
 */
export function migrateCompletionSettings(settings: any): any {
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

  // Add future migrations here as needed
  if (migratedSettings.version < 3) {
    // Migration to version 3: Add enable_thinking parameter
    migratedSettings.enable_thinking = defaultCompletionParams.enable_thinking;
    migratedSettings.version = 3;
  }

  // Add future migrations here as needed
  // if (migratedSettings.version < 4) {
  //   // Migration to version 4
  //   migratedSettings.new_field = defaultCompletionParams.new_field;
  //   migratedSettings.version = 4;
  // }

  return migratedSettings;
}
