/**
 * PluginLoader — validates a manifest and instantiates a plugin.
 *
 * Loader responsibilities:
 *  - Validate the manifest schema (required fields, semver shape, etc.)
 *  - Build a sandboxed context for the plugin
 *  - Run the plugin's entry function and capture the returned instance
 *  - Track plugin status (loaded / error / enabled / disabled)
 *
 * Loader does NOT:
 *  - Discover plugins on disk (native module will do this later)
 *  - Persist the enabled/disabled flag (handled by a MobX store, future)
 *  - Load arbitrary JS bundles (native Hermes sandbox will do this)
 *
 * For now, the entry function is passed in directly — this lets us test
 * the full loader path today and gives the native module a single
 * integration point: it only needs to hand us an entry function.
 */

import {pluginRegistry} from './PluginRegistry';
import {PluginSandbox, runPluginEntry} from './PluginSandbox';
import type {
  PluginManifest,
  PluginEntry,
  PluginInstance,
  PluginRecord,
  ManifestValidation,
} from './types';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;
const PLUGIN_ID_RE = /^[a-z0-9]+(?:\.[a-z0-9]+)+$/;

export class PluginLoader {
  private sandbox = new PluginSandbox();

  /**
   * Validate a manifest's schema without loading the plugin.
   * Returns {valid, errors}. Used by the UI before showing install confirm.
   */
  validateManifest(manifest: PluginManifest): ManifestValidation {
    const errors: string[] = [];

    if (!manifest.id) {
      errors.push('manifest.id is required');
    } else if (!PLUGIN_ID_RE.test(manifest.id)) {
      errors.push(
        `manifest.id "${manifest.id}" must be reverse-DNS (e.g. com.example.foo)`,
      );
    }

    if (!manifest.name) {
      errors.push('manifest.name is required');
    }

    if (!manifest.version) {
      errors.push('manifest.version is required');
    } else if (!SEMVER_RE.test(manifest.version)) {
      errors.push(`manifest.version "${manifest.version}" is not valid semver`);
    }

    if (!manifest.entry) {
      errors.push('manifest.entry is required');
    }

    if (!Array.isArray(manifest.permissions)) {
      errors.push('manifest.permissions must be an array');
    }

    if (manifest.minAppVersion && !SEMVER_RE.test(manifest.minAppVersion)) {
      errors.push('manifest.minAppVersion is not valid semver');
    }

    return {valid: errors.length === 0, errors};
  }

  /**
   * Load a plugin: validate manifest, build sandbox context, run entry.
   * On success the plugin is registered with status 'loaded'.
   * On failure it is registered with status 'error' and the error message.
   */
  async load(
    manifest: PluginManifest,
    entry: PluginEntry,
  ): Promise<PluginRecord> {
    // Already loaded? Replace record.
    const existing = pluginRegistry.get(manifest.id);
    if (existing?.instance?.dispose) {
      try {
        await existing.instance.dispose();
      } catch {
        // Best-effort dispose
      }
    }

    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      const record: PluginRecord = {
        manifest,
        status: 'error',
        instance: null,
        error: `Invalid manifest: ${validation.errors.join('; ')}`,
        loadedAt: new Date().toISOString(),
      };
      pluginRegistry.register(record);
      return record;
    }

    try {
      const context = this.sandbox.buildContext(manifest);
      const instance: PluginInstance = await runPluginEntry(entry, context);

      const record: PluginRecord = {
        manifest,
        status: 'loaded',
        instance,
        loadedAt: new Date().toISOString(),
      };
      pluginRegistry.register(record);
      return record;
    } catch (err: any) {
      const record: PluginRecord = {
        manifest,
        status: 'error',
        instance: null,
        error: err?.message || String(err),
        loadedAt: new Date().toISOString(),
      };
      pluginRegistry.register(record);
      return record;
    }
  }

  /**
   * Enable a loaded plugin (calls instance if it needs init — none for now).
   */
  async enable(pluginId: string): Promise<void> {
    const record = pluginRegistry.get(pluginId);
    if (!record) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    if (record.status === 'error') {
      throw new Error(`Cannot enable errored plugin: ${record.error}`);
    }
    record.status = 'enabled';
  }

  /** Disable a plugin. */
  async disable(pluginId: string): Promise<void> {
    const record = pluginRegistry.get(pluginId);
    if (!record) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    record.status = 'disabled';
  }

  /**
   * Unload a plugin: call dispose(), remove from registry.
   * Storage is left intact (user may re-enable later).
   */
  async unload(pluginId: string): Promise<void> {
    const record = pluginRegistry.get(pluginId);
    if (!record) {
      return;
    }
    if (record.instance?.dispose) {
      try {
        await record.instance.dispose();
      } catch {
        // Best-effort
      }
    }
    pluginRegistry.remove(pluginId);
  }

  /**
   * Invoke a plugin's execute() if it is enabled.
   */
  async execute(
    pluginId: string,
    args: Record<string, any>,
  ): Promise<{type: 'text' | 'html' | 'error'; summary: string; html?: string; errorMessage?: string}> {
    const record = pluginRegistry.get(pluginId);
    if (!record) {
      return {type: 'error', summary: `Plugin not found: ${pluginId}`, errorMessage: 'not found'};
    }
    if (record.status !== 'enabled') {
      return {type: 'error', summary: `Plugin not enabled (status: ${record.status})`, errorMessage: 'not enabled'};
    }
    if (!record.instance?.execute) {
      return {type: 'error', summary: `Plugin has no execute()`, errorMessage: 'no execute'};
    }
    try {
      return await record.instance.execute(args);
    } catch (err: any) {
      return {
        type: 'error',
        summary: err?.message || String(err),
        errorMessage: err?.message || String(err),
      };
    }
  }
}

export const pluginLoader = new PluginLoader();
