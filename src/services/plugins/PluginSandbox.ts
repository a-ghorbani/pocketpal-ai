/**
 * PluginSandbox — builds the PluginContext handed to a plugin's entry fn.
 *
 * ADR-2026-006 notes: a real Hermes-isolated sandbox will eventually be a
 * native module. Until then, this JS sandbox enforces the contract by
 * construction: each method on the context checks the manifest's declared
 * permissions and throws if a capability is used without permission.
 *
 * Plugins therefore cannot reach globals they were not handed — the only
 * reachable surface is the PluginContext returned here.
 */

import {resolveTokens} from '../../theme/tokens';
import {talentRegistry} from '../talents/TalentRegistry';
import type {
  PluginManifest,
  PluginContext,
  PluginLogger,
  PluginStorage,
  PluginResult,
  PluginFetchOptions,
  PluginFetchResult,
} from './types';
import {PluginStorageImpl} from './PluginStorage';

/** Error thrown when a plugin uses a capability it didn't declare. */
export class PermissionDeniedError extends Error {
  constructor(pluginId: string, permission: string) {
    super(`Plugin "${pluginId}" lacks permission "${permission}"`);
    this.name = 'PermissionDeniedError';
  }
}

export class PluginSandbox {
  /**
   * Build a PluginContext for the given manifest. The context is what gets
   * passed to the plugin's entry function. Every capability checks the
   * manifest's declared permissions before dispatching.
   */
  buildContext(manifest: PluginManifest): PluginContext {
    const logger = this.buildLogger(manifest.id);
    const storage = this.buildStorage(manifest);
    const talents = this.buildTalents(manifest);
    const network = this.buildNetwork(manifest);
    const tokens = this.buildTokens();

    return {manifest, logger, storage, talents, network, tokens};
  }

  private hasPermission(manifest: PluginManifest, perm: string): boolean {
    return manifest.permissions.includes(perm as any);
  }

  private buildLogger(pluginId: string): PluginLogger {
    const prefix = `[plugin:${pluginId}]`;
    return {
      debug: (msg, ...args) => console.debug(prefix, msg, ...args),
      info: (msg, ...args) => console.info(prefix, msg, ...args),
      warn: (msg, ...args) => console.warn(prefix, msg, ...args),
      error: (msg, ...args) => console.error(prefix, msg, ...args),
    };
  }

  private buildStorage(manifest: PluginManifest): PluginStorage {
    // Read & write each checked at call time — a plugin may have only
    // read or only write, so we cannot pre-decide in the constructor.
    const impl = new PluginStorageImpl(manifest.id);
    const canRead = () => this.hasPermission(manifest, 'storage.read');
    const canWrite = () => this.hasPermission(manifest, 'storage.write');

    return {
      get: async key => {
        if (!canRead()) throw new PermissionDeniedError(manifest.id, 'storage.read');
        return impl.get(key);
      },
      set: async (key, value) => {
        if (!canWrite()) throw new PermissionDeniedError(manifest.id, 'storage.write');
        await impl.set(key, value);
      },
      remove: async key => {
        if (!canWrite()) throw new PermissionDeniedError(manifest.id, 'storage.write');
        await impl.remove(key);
      },
      keys: async () => {
        if (!canRead()) throw new PermissionDeniedError(manifest.id, 'storage.read');
        return impl.keys();
      },
      clear: async () => {
        if (!canWrite()) throw new PermissionDeniedError(manifest.id, 'storage.write');
        await impl.clear();
      },
    };
  }

  private buildTalents(manifest: PluginManifest): PluginContext['talents'] {
    const canCall = () => this.hasPermission(manifest, 'talents.call');

    return {
      call: async (name, args) => {
        if (!canCall()) {
          throw new PermissionDeniedError(manifest.id, 'talents.call');
        }
        const engine = talentRegistry.get(name);
        if (!engine) {
          return {
            type: 'error',
            summary: `Unknown talent: ${name}`,
            errorMessage: `Unknown talent: ${name}`,
          };
        }
        return engine.execute(args || {});
      },
      list: () => {
        if (!canCall()) {
          throw new PermissionDeniedError(manifest.id, 'talents.call');
        }
        return talentRegistry.getAll().map(e => e.name);
      },
    };
  }

  private buildNetwork(manifest: PluginManifest): PluginContext['network'] {
    const canFetch = () => this.hasPermission(manifest, 'network.fetch');
    const pluginId = manifest.id;

    return {
      fetch: async (url: string, options?: PluginFetchOptions): Promise<PluginFetchResult> => {
        if (!canFetch()) {
          throw new PermissionDeniedError(pluginId, 'network.fetch');
        }

        const timeoutMs = options?.timeoutMs ?? 15000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(url, {
            method: options?.method ?? 'GET',
            headers: options?.headers,
            body: options?.body,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const headers: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });

          let bodyText: string | undefined;
          const getBodyText = async (): Promise<string> => {
            if (bodyText === undefined) {
              bodyText = await response.text();
            }
            return bodyText;
          };

          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers,
            text: getBodyText,
            json: async <T = any>(): Promise<T> => {
              const text = await getBodyText();
              return JSON.parse(text) as T;
            },
          };
        } catch (e) {
          clearTimeout(timeoutId);
          throw e;
        }
      },
    };
  }

  private buildTokens(): PluginContext['tokens'] {
    // Design tokens are read-only public data — no permission gate.
    return {
      get: mode => resolveTokens(mode),
    };
  }
}

/**
 * Run a plugin's entry function inside the sandbox. Returns the PluginInstance.
 * Catches synchronous throws from the entry fn and rethrows as a structured
 * error so the loader can mark the plugin as errored.
 */
export async function runPluginEntry(
  entry: (ctx: PluginContext) => Promise<any> | any,
  context: PluginContext,
): Promise<NonNullable<ReturnType<typeof entry>>> {
  try {
    return await entry(context);
  } catch (err: any) {
    const message = err?.message || String(err);
    throw new Error(`Plugin entry threw: ${message}`);
  }
}

/** Convenience type re-export so callers don't need PluginResult import. */
export type {PluginResult};
