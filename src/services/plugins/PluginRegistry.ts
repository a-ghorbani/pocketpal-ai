/**
 * PluginRegistry — id-keyed registry of loaded plugins.
 *
 * Mirrors TalentRegistry: simple Map with register/get/has/getAll/reset.
 * Plugins are keyed by manifest.id (globally unique).
 */

import type {PluginRecord} from './types';

export class PluginRegistry {
  private plugins = new Map<string, PluginRecord>();

  register(record: PluginRecord): void {
    this.plugins.set(record.manifest.id, record);
  }

  get(id: string): PluginRecord | undefined {
    return this.plugins.get(id);
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  getAll(): PluginRecord[] {
    return Array.from(this.plugins.values());
  }

  /** Plugins in a given status. */
  getByStatus(status: PluginRecord['status']): PluginRecord[] {
    return this.getAll().filter(p => p.status === status);
  }

  /** Remove a plugin record (does not dispose — caller must dispose first). */
  remove(id: string): void {
    this.plugins.delete(id);
  }

  /** Test helper. */
  reset(): void {
    this.plugins.clear();
  }
}

export const pluginRegistry = new PluginRegistry();
