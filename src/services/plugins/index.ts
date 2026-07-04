/**
 * Plugin service barrel export (ADR-2026-006).
 *
 * Mirrors the talents/index.ts pattern:
 *   registerDefaultPlugins() — idempotent built-in registration
 *
 * The plugin API surface is defined in types.ts (PluginManifest,
 * PluginContext, PluginEntry, PluginInstance). Community plugins implement
 * PluginEntry and are loaded via PluginLoader.load(manifest, entry).
 *
 * Built-in plugins are registered in registerDefaultPlugins() when added.
 */

export {PluginRegistry, pluginRegistry} from './PluginRegistry';
export {PluginSandbox, PermissionDeniedError} from './PluginSandbox';
export {PluginLoader, pluginLoader} from './PluginLoader';
export {
  PluginStorageImpl,
  clearAllPluginStorage,
  pluginStorageKey,
} from './PluginStorage';

export type {
  PluginPermission,
  PluginStatus,
  PluginManifest,
  PluginLogger,
  PluginStorage,
  PluginContext,
  PluginEntry,
  PluginInstance,
  PluginResult,
  PluginRecord,
  ManifestValidation,
} from './types';

import {pluginRegistry} from './PluginRegistry';

let registered = false;

/**
 * Register built-in plugins. Idempotent — safe to call from any app-init
 * path. Currently a no-op until the first built-in plugin lands; kept for
 * symmetry with registerDefaultTalents() so callers wire it up once.
 */
export function registerDefaultPlugins(): void {
  if (registered) {
    return;
  }
  // Built-in plugins will be registered here when they land.
  // (Community plugins are loaded dynamically via PluginLoader, not here.)
  registered = true;
}

/**
 * Test helper: reset the registered guard so registerDefaultPlugins() will
 * re-register after a pluginRegistry.reset() call in test teardown.
 */
export function resetPluginRegisteredFlag(): void {
  registered = false;
  pluginRegistry.reset();
}
