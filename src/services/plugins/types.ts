/**
 * Plugin system types (ADR-2026-006: client-only plugin sandbox).
 *
 * Architecture mirrors the Talent registry:
 *   PluginManifest → PluginLoader → PluginRegistry → registerDefaultPlugins()
 *
 * Plugins run inside a JS-level sandbox (PluginSandbox) that exposes a
 * strictly limited PluginContext. A real Hermes-isolated sandbox will
 * require a native module; until then this JS sandbox enforces the
 * contract by construction (only the context's methods are reachable).
 */

import type {Tokens} from '../../theme/tokens';
import type {TalentResult} from '../talents/types';

/** Permissions a plugin may request. Mirrors ADR-2026-006 risk notes. */
export type PluginPermission =
  | 'talents.call' // invoke registered Talent engines
  | 'storage.read' // read plugin-scoped key/value store
  | 'storage.write' // write plugin-scoped key/value store
  | 'network.fetch' // fetch remote URLs (TODO: native gate)
  | 'logger'; // write to app log

/** Plugin lifecycle states. */
export type PluginStatus = 'loaded' | 'enabled' | 'disabled' | 'error';

/** Manifest declared in each .pppak's manifest.json. */
export interface PluginManifest {
  /** Globally unique id, e.g. `com.example.weather`. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Semver version string, e.g. `1.0.0`. */
  version: string;
  /** Short description. */
  description?: string;
  /** Author / maintainer. */
  author?: string;
  /** Minimum PocketPal app version required (semver). */
  minAppVersion?: string;
  /** Entry-point function name exported by the bundle. */
  entry: string;
  /** Declared permissions — sandbox will deny anything not listed. */
  permissions: PluginPermission[];
  /** Optional UI surface this plugin contributes to (future). */
  ui?: {
    /** Render result inline inside chat (mirrors TalentUI). */
    inline?: boolean;
    /** Contribute a settings screen (future). */
    settings?: boolean;
  };
}

/** Logging surface exposed to plugins. */
export interface PluginLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/** Plugin-scoped key/value storage. Keys are namespaced under the plugin id. */
export interface PluginStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

/** Sandbox API handed to a plugin's entry function. */
export interface PluginContext {
  /** The manifest of the running plugin. */
  manifest: PluginManifest;
  /** Logger scoped to this plugin. */
  logger: PluginLogger;
  /** Plugin-scoped storage (requires `storage.read` / `storage.write`). */
  storage: PluginStorage;
  /** Invoke a registered Talent engine by name (requires `talents.call`). */
  talents: {
    call(name: string, args: Record<string, any>): Promise<TalentResult>;
    list(): string[];
  };
  /** Read design tokens for the requested mode (no permission needed). */
  tokens: {
    get(mode: 'light' | 'dark'): Tokens;
  };
}

/** Factory exported by a plugin bundle. */
export type PluginEntry = (context: PluginContext) => Promise<PluginInstance> | PluginInstance;

/** Handle returned by a plugin's entry function. */
export interface PluginInstance {
  /** Optional — called when the plugin is disabled/unloaded. */
  dispose?: () => Promise<void> | void;
  /** Optional — execute the plugin's primary action (Talent-style). */
  execute?: (args: Record<string, any>) => Promise<PluginResult>;
}

/** Result shape returned by a plugin's execute(). */
export type PluginResult =
  | {type: 'html'; html: string; title?: string; summary: string}
  | {type: 'text'; summary: string}
  | {type: 'error'; summary: string; errorMessage: string};

/** A loaded plugin record held by the registry. */
export interface PluginRecord {
  manifest: PluginManifest;
  status: PluginStatus;
  instance: PluginInstance | null;
  /** Last error message if status === 'error'. */
  error?: string;
  /** When the plugin was loaded. */
  loadedAt: string;
}

/** Manifest schema validation result. */
export interface ManifestValidation {
  valid: boolean;
  errors: string[];
}
