/**
 * PluginLoader tests.
 *
 * Tests manifest validation, full load→enable→execute→unload flow,
 * and error handling. Uses the in-memory PluginRegistry (reset per test).
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    getAllKeys: jest.fn(),
    multiRemove: jest.fn(),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {PluginLoader} from '../PluginLoader';
import {pluginRegistry} from '../PluginRegistry';
import type {PluginManifest, PluginEntry} from '../types';

const mockStorage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(mockStorage[key] || null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation((key, val) => {
    mockStorage[key] = val;
    return Promise.resolve();
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
    delete mockStorage[key];
    return Promise.resolve();
  });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(() =>
    Promise.resolve(Object.keys(mockStorage)),
  );
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation((keys: string[]) => {
    keys.forEach(k => delete mockStorage[k]);
    return Promise.resolve();
  });
  pluginRegistry.reset();
});

const validManifest: PluginManifest = {
  id: 'com.example.hello',
  name: 'Hello Plugin',
  version: '1.0.0',
  entry: 'default',
  permissions: ['talents.call'],
};

describe('PluginLoader.validateManifest', () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  it('accepts a valid manifest', () => {
    const result = loader.validateManifest(validManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing id', () => {
    const result = loader.validateManifest({
      ...validManifest,
      id: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('id is required');
  });

  it('rejects non-reverse-DNS id', () => {
    const result = loader.validateManifest({
      ...validManifest,
      id: 'not-valid-id',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('reverse-DNS');
  });

  it('accepts reverse-DNS id', () => {
    const result = loader.validateManifest({
      ...validManifest,
      id: 'com.example.weather',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing name', () => {
    const result = loader.validateManifest({
      ...validManifest,
      name: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('name is required');
  });

  it('rejects missing version', () => {
    const result = loader.validateManifest({
      ...validManifest,
      version: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('version is required');
  });

  it('rejects non-semver version', () => {
    const result = loader.validateManifest({
      ...validManifest,
      version: '1.0',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('semver');
  });

  it('accepts semver with prerelease and build metadata', () => {
    const result = loader.validateManifest({
      ...validManifest,
      version: '1.0.0-beta.1+build.123',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing entry', () => {
    const result = loader.validateManifest({
      ...validManifest,
      entry: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('entry is required');
  });

  it('rejects non-array permissions', () => {
    const result = loader.validateManifest({
      ...validManifest,
      permissions: 'storage.read' as any,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('permissions must be an array');
  });

  it('rejects invalid minAppVersion', () => {
    const result = loader.validateManifest({
      ...validManifest,
      minAppVersion: '1.0',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join('; ')).toContain('minAppVersion');
  });

  it('accepts valid minAppVersion', () => {
    const result = loader.validateManifest({
      ...validManifest,
      minAppVersion: '1.16.0',
    });
    expect(result.valid).toBe(true);
  });
});

describe('PluginLoader.load', () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  it('loads a valid plugin and registers it as "loaded"', async () => {
    const entry: PluginEntry = async () => ({
      execute: async args => ({type: 'text', summary: `echo ${args.x}`}),
    });

    const record = await loader.load(validManifest, entry);

    expect(record.status).toBe('loaded');
    expect(record.instance).toBeDefined();
    expect(record.manifest.id).toBe('com.example.hello');
    expect(record.loadedAt).toBeDefined();
  });

  it('registers the plugin in the global registry', async () => {
    const entry: PluginEntry = async () => ({});
    await loader.load(validManifest, entry);

    expect(pluginRegistry.has('com.example.hello')).toBe(true);
  });

  it('rejects invalid manifest and marks as "error"', async () => {
    const invalid = {...validManifest, id: 'bad'};
    const entry: PluginEntry = async () => ({});

    const record = await loader.load(invalid, entry);

    expect(record.status).toBe('error');
    expect(record.error).toContain('Invalid manifest');
    expect(record.instance).toBeNull();
  });

  it('marks plugin as "error" when entry throws', async () => {
    const entry: PluginEntry = async () => {
      throw new Error('boom');
    };

    const record = await loader.load(validManifest, entry);

    expect(record.status).toBe('error');
    expect(record.error).toContain('boom');
  });

  it('replaces existing record on reload (and disposes)', async () => {
    const disposed: string[] = [];
    const entry1: PluginEntry = async () => ({
      dispose: () => {
        disposed.push('first');
      },
    });
    const entry2: PluginEntry = async () => ({
      execute: async () => ({type: 'text', summary: 'second'}),
    });

    await loader.load(validManifest, entry1);
    await loader.load(validManifest, entry2);

    expect(disposed).toEqual(['first']);
    expect(pluginRegistry.get('com.example.hello')?.instance?.execute).toBeDefined();
  });
});

describe('PluginLoader enable / disable / unload', () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  it('transitions loaded → enabled → disabled', async () => {
    const entry: PluginEntry = async () => ({});
    await loader.load(validManifest, entry);

    await loader.enable('com.example.hello');
    expect(pluginRegistry.get('com.example.hello')?.status).toBe('enabled');

    await loader.disable('com.example.hello');
    expect(pluginRegistry.get('com.example.hello')?.status).toBe('disabled');
  });

  it('throws when enabling an errored plugin', async () => {
    const badManifest = {...validManifest, id: 'bad'};
    const entry: PluginEntry = async () => {
      throw new Error('init failed');
    };
    await loader.load(badManifest, entry);

    await expect(loader.enable('bad')).rejects.toThrow('Cannot enable');
  });

  it('throws when enabling a non-existent plugin', async () => {
    await expect(loader.enable('missing')).rejects.toThrow('not found');
  });

  it('unloads a plugin and removes it from registry', async () => {
    const entry: PluginEntry = async () => ({});
    await loader.load(validManifest, entry);

    await loader.unload('com.example.hello');

    expect(pluginRegistry.has('com.example.hello')).toBe(false);
  });

  it('calls dispose() during unload', async () => {
    const disposed: string[] = [];
    const entry: PluginEntry = async () => ({
      dispose: () => {
        disposed.push('done');
      },
    });
    await loader.load(validManifest, entry);

    await loader.unload('com.example.hello');

    expect(disposed).toEqual(['done']);
  });

  it('unload is a no-op for unknown plugin', async () => {
    await expect(loader.unload('missing')).resolves.toBeUndefined();
  });
});

describe('PluginLoader.execute', () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  it('executes an enabled plugin', async () => {
    const entry: PluginEntry = async () => ({
      execute: async args => ({type: 'text', summary: `hi ${args.name}`}),
    });
    await loader.load(validManifest, entry);
    await loader.enable('com.example.hello');

    const result = await loader.execute('com.example.hello', {name: 'world'});

    expect(result.type).toBe('text');
    expect(result.summary).toBe('hi world');
  });

  it('returns error result for unknown plugin', async () => {
    const result = await loader.execute('missing', {});
    expect(result.type).toBe('error');
    expect(result.errorMessage).toBe('not found');
  });

  it('returns error result when plugin is not enabled', async () => {
    const entry: PluginEntry = async () => ({});
    await loader.load(validManifest, entry);
    // not enabled
    const result = await loader.execute('com.example.hello', {});
    expect(result.type).toBe('error');
    expect(result.errorMessage).toBe('not enabled');
  });

  it('returns error result when plugin has no execute()', async () => {
    const entry: PluginEntry = async () => ({});
    await loader.load(validManifest, entry);
    await loader.enable('com.example.hello');

    const result = await loader.execute('com.example.hello', {});
    expect(result.type).toBe('error');
    expect(result.errorMessage).toBe('no execute');
  });

  it('catches errors thrown by execute()', async () => {
    const entry: PluginEntry = async () => ({
      execute: async () => {
        throw new Error('runtime fail');
      },
    });
    await loader.load(validManifest, entry);
    await loader.enable('com.example.hello');

    const result = await loader.execute('com.example.hello', {});
    expect(result.type).toBe('error');
    expect(result.summary).toContain('runtime fail');
  });

  it('returns html result type from plugin', async () => {
    const entry: PluginEntry = async () => ({
      execute: async () => ({
        type: 'html',
        html: '<b>hello</b>',
        summary: 'hello',
      }),
    });
    await loader.load(validManifest, entry);
    await loader.enable('com.example.hello');

    const result = await loader.execute('com.example.hello', {});
    expect(result.type).toBe('html');
    expect((result as any).html).toBe('<b>hello</b>');
  });
});
