/**
 * PluginStorage — namespaced AsyncStorage wrapper for plugins.
 *
 * Every key a plugin reads/writes is prefixed with `pp:plugin:<id>:` so
 * one plugin cannot read another plugin's data. The manifest's
 * `permissions` array gates whether storage is accessible at all
 * (checked in PluginSandbox, not here).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type {PluginStorage as IPluginStorage} from './types';

const PREFIX = 'pp:plugin:';

export class PluginStorageImpl implements IPluginStorage {
  private namespace: string;

  constructor(pluginId: string) {
    this.namespace = `${PREFIX}${pluginId}:`;
  }

  private namespacedKey(key: string): string {
    return `${this.namespace}${key}`;
  }

  async get(key: string): Promise<string | null> {
    return AsyncStorage.getItem(this.namespacedKey(key));
  }

  async set(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(this.namespacedKey(key), value);
  }

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(this.namespacedKey(key));
  }

  async keys(): Promise<string[]> {
    const allKeys = await AsyncStorage.getAllKeys();
    return (allKeys || [])
      .filter(k => k.startsWith(this.namespace))
      .map(k => k.slice(this.namespace.length));
  }

  async clear(): Promise<void> {
    const mine = await AsyncStorage.getAllKeys();
    const toRemove = (mine || []).filter(k => k.startsWith(this.namespace));
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  }
}

/**
 * Remove all plugin-scoped data for every plugin.
 * Used during factory reset (not by individual plugins).
 */
export async function clearAllPluginStorage(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const pluginKeys = (allKeys || []).filter(k => k.startsWith(PREFIX));
  if (pluginKeys.length > 0) {
    await AsyncStorage.multiRemove(pluginKeys);
  }
}

/** Test helper: build the namespaced key without instantiating storage. */
export function pluginStorageKey(pluginId: string, key: string): string {
  return `${PREFIX}${pluginId}:${key}`;
}
