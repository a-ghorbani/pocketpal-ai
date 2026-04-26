/**
 * Tests for completion settings versioning and migration
 */

import {
  migrateCompletionSettings,
  defaultCompletionParams,
  CURRENT_COMPLETION_SETTINGS_VERSION,
} from '../completionSettingsVersions';

describe('migrateCompletionSettings', () => {
  it('should add version 0 to settings without version', () => {
    const settings = {temperature: 0.7};
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.temperature).toBe(0.7);
  });

  it('should migrate from version 0 to version 1', () => {
    const settings = {
      version: 0,
      temperature: 0.7,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.include_thinking_in_context).toBe(
      defaultCompletionParams.include_thinking_in_context,
    );
    expect(migrated.temperature).toBe(0.7);
  });

  it('should migrate from version 1 to version 2', () => {
    const settings = {
      version: 1,
      temperature: 0.7,
      include_thinking_in_context: false,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.jinja).toBe(defaultCompletionParams.jinja);
    expect(migrated.include_thinking_in_context).toBe(false);
    expect(migrated.temperature).toBe(0.7);
  });

  it('should migrate from version 2 to version 3 (add enable_thinking)', () => {
    const settings = {
      version: 2,
      temperature: 0.7,
      include_thinking_in_context: true,
      jinja: true,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.enable_thinking).toBe(
      defaultCompletionParams.enable_thinking,
    );
    expect(migrated.jinja).toBe(true);
    expect(migrated.include_thinking_in_context).toBe(true);
    expect(migrated.temperature).toBe(0.7);
  });

  it('should migrate from version 3 to version 4 when n_predict is old default (1024)', () => {
    const settings = {
      version: 3,
      temperature: 0.7,
      n_predict: 1024,
      enable_thinking: true,
      jinja: true,
      include_thinking_in_context: true,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(4);
    expect(migrated.n_predict).toBe(-1);
    expect(migrated.temperature).toBe(0.7);
  });

  it('should preserve custom n_predict value during v3 to v4 migration', () => {
    const settings = {
      version: 3,
      temperature: 0.7,
      n_predict: 2048,
      enable_thinking: true,
      jinja: true,
      include_thinking_in_context: true,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(4);
    expect(migrated.n_predict).toBe(2048);
  });

  it('should preserve n_predict=500 (per-model default) during v3 to v4 migration', () => {
    const settings = {
      version: 3,
      n_predict: 500,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(4);
    expect(migrated.n_predict).toBe(500);
  });

  it('should migrate through multiple versions', () => {
    const settings = {
      version: 0,
      temperature: 0.5,
      top_p: 0.9,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.include_thinking_in_context).toBe(
      defaultCompletionParams.include_thinking_in_context,
    );
    expect(migrated.jinja).toBe(defaultCompletionParams.jinja);
    expect(migrated.enable_thinking).toBe(
      defaultCompletionParams.enable_thinking,
    );
    expect(migrated.temperature).toBe(0.5);
    expect(migrated.top_p).toBe(0.9);
  });

  it('should migrate from v0 to v4 applying all migrations including conditional n_predict', () => {
    const settings = {
      version: 0,
      temperature: 0.5,
      n_predict: 1024,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(4);
    expect(migrated.include_thinking_in_context).toBe(
      defaultCompletionParams.include_thinking_in_context,
    );
    expect(migrated.jinja).toBe(defaultCompletionParams.jinja);
    expect(migrated.enable_thinking).toBe(
      defaultCompletionParams.enable_thinking,
    );
    expect(migrated.n_predict).toBe(-1);
    expect(migrated.temperature).toBe(0.5);
  });

  it('should migrate from v0 to v4 preserving custom n_predict', () => {
    const settings = {
      version: 0,
      temperature: 0.5,
      n_predict: 2048,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(4);
    expect(migrated.n_predict).toBe(2048);
  });

  it('should not modify settings that are already current version', () => {
    const settings = {
      version: CURRENT_COMPLETION_SETTINGS_VERSION,
      temperature: 0.8,
      include_thinking_in_context: false,
      jinja: false,
      enable_thinking: false,
      n_predict: 2048,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated).toEqual(settings);
  });

  it('should not modify n_predict when already at version 4', () => {
    const settings = {
      version: 4,
      n_predict: 1024,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(4);
    expect(migrated.n_predict).toBe(1024);
  });

  it('should preserve existing values during migration', () => {
    const settings = {
      version: 1,
      temperature: 0.3,
      include_thinking_in_context: false,
      top_k: 50,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.temperature).toBe(0.3);
    expect(migrated.include_thinking_in_context).toBe(false); // Preserved
    expect(migrated.top_k).toBe(50);
    expect(migrated.jinja).toBe(defaultCompletionParams.jinja); // Added
    expect(migrated.enable_thinking).toBe(
      defaultCompletionParams.enable_thinking,
    ); // Added
  });

  it('should handle empty settings object', () => {
    const settings = {};
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.include_thinking_in_context).toBe(
      defaultCompletionParams.include_thinking_in_context,
    );
    expect(migrated.jinja).toBe(defaultCompletionParams.jinja);
    expect(migrated.enable_thinking).toBe(
      defaultCompletionParams.enable_thinking,
    );
  });

  it('should not mutate the original settings object', () => {
    const settings = {
      version: 0,
      temperature: 0.7,
    };
    const originalSettings = {...settings};
    const migrated = migrateCompletionSettings(settings);

    expect(settings).toEqual(originalSettings);
    expect(migrated).not.toBe(settings);
  });
});

describe('defaultCompletionParams', () => {
  it('should have the current version', () => {
    expect(defaultCompletionParams.version).toBe(
      CURRENT_COMPLETION_SETTINGS_VERSION,
    );
  });

  it('should have enable_thinking set to true by default', () => {
    expect(defaultCompletionParams.enable_thinking).toBe(true);
  });

  it('should have include_thinking_in_context set to true by default', () => {
    expect(defaultCompletionParams.include_thinking_in_context).toBe(true);
  });

  it('should have jinja set to true by default', () => {
    expect(defaultCompletionParams.jinja).toBe(true);
  });

  it('should have n_predict set to -1 (unlimited) by default', () => {
    expect(defaultCompletionParams.n_predict).toBe(-1);
  });

  it('should have CURRENT_COMPLETION_SETTINGS_VERSION equal to 4', () => {
    expect(CURRENT_COMPLETION_SETTINGS_VERSION).toBe(4);
  });
});
