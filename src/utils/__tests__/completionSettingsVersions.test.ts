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

  it('should migrate from version 1 to version 2 (jinja removed)', () => {
    const settings = {
      version: 1,
      temperature: 0.7,
      include_thinking_in_context: false,
      jinja: true,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.jinja).toBeUndefined();
    expect(migrated.include_thinking_in_context).toBe(false);
    expect(migrated.temperature).toBe(0.7);
  });

  it('should migrate from version 2 to version 3 (add enable_thinking)', () => {
    const settings = {
      version: 2,
      temperature: 0.7,
      include_thinking_in_context: true,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
    expect(migrated.enable_thinking).toBe(
      defaultCompletionParams.enable_thinking,
    );
    expect(migrated.include_thinking_in_context).toBe(true);
    expect(migrated.temperature).toBe(0.7);
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
    expect(migrated.jinja).toBeUndefined();
    expect(migrated.enable_thinking).toBe(
      defaultCompletionParams.enable_thinking,
    );
    expect(migrated.temperature).toBe(0.5);
    expect(migrated.top_p).toBe(0.9);
  });

  it('should not modify settings that are already current version', () => {
    const settings = {
      version: CURRENT_COMPLETION_SETTINGS_VERSION,
      temperature: 0.8,
      include_thinking_in_context: false,
      enable_thinking: false,
    };
    const migrated = migrateCompletionSettings(settings);

    expect(migrated).toEqual(settings);
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
    expect(migrated.jinja).toBeUndefined(); // Removed in v2 migration
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
    expect(migrated.jinja).toBeUndefined();
    expect(migrated.enable_thinking).toBe(
      defaultCompletionParams.enable_thinking,
    );
    expect(migrated.reserved_output_tokens).toBe(
      defaultCompletionParams.reserved_output_tokens,
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

  it('should have reserved_output_tokens set by default', () => {
    expect(defaultCompletionParams.reserved_output_tokens).toBe(128);
  });
});
