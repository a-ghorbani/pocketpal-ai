/**
 * PluginSandbox tests.
 *
 * Tests the permission-gating behaviour of the sandbox API and the
 * integration with the TalentRegistry + token resolver.
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
import {PluginSandbox, PermissionDeniedError} from '../PluginSandbox';
import {talentRegistry} from '../../talents/TalentRegistry';
import type {TalentEngine, TalentResult, PluginManifest} from '../types';

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
  talentRegistry.reset();
});

const baseManifest: PluginManifest = {
  id: 'com.example.test',
  name: 'Test Plugin',
  version: '1.0.0',
  entry: 'default',
  permissions: [],
};

function buildManifest(permissions: PluginManifest['permissions']): PluginManifest {
  return {...baseManifest, permissions};
}

describe('PluginSandbox', () => {
  let sandbox: PluginSandbox;

  beforeEach(() => {
    sandbox = new PluginSandbox();
  });

  describe('storage permission gating', () => {
    it('allows read when storage.read is declared', async () => {
      const manifest = buildManifest(['storage.read']);
      const ctx = sandbox.buildContext(manifest);
      // Write via direct mock since plugin can't write
      mockStorage['pp:plugin:com.example.test:k'] = 'value';
      expect(await ctx.storage.get('k')).toBe('value');
    });

    it('denies read when storage.read is not declared', async () => {
      const manifest = buildManifest([]);
      const ctx = sandbox.buildContext(manifest);
      await expect(ctx.storage.get('k')).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    });

    it('allows write when storage.write is declared', async () => {
      const manifest = buildManifest(['storage.write']);
      const ctx = sandbox.buildContext(manifest);
      await ctx.storage.set('k', 'v');
      expect(mockStorage['pp:plugin:com.example.test:k']).toBe('v');
    });

    it('denies write when storage.write is not declared', async () => {
      const manifest = buildManifest([]);
      const ctx = sandbox.buildContext(manifest);
      await expect(ctx.storage.set('k', 'v')).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    });

    it('allows read+write independently', async () => {
      const manifest = buildManifest(['storage.read']);
      const ctx = sandbox.buildContext(manifest);
      // Read ok
      await ctx.storage.get('k');
      // Write denied
      await expect(ctx.storage.set('k', 'v')).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    });
  });

  describe('talents permission gating', () => {
    it('lists talent names when talents.call is declared', () => {
      const manifest = buildManifest(['talents.call']);
      const fakeEngine: TalentEngine = {
        name: 'fake',
        execute: async () => ({type: 'text', summary: 'ok'}),
        toToolDefinition: () => ({
          type: 'function',
          function: {name: 'fake', description: '', parameters: {}},
        }),
      };
      talentRegistry.register(fakeEngine);

      const ctx = sandbox.buildContext(manifest);
      expect(ctx.talents.list()).toContain('fake');
    });

    it('denies list when talents.call is not declared', () => {
      const manifest = buildManifest([]);
      const ctx = sandbox.buildContext(manifest);
      expect(() => ctx.talents.list()).toThrow(PermissionDeniedError);
    });

    it('calls registered engine when permitted', async () => {
      const manifest = buildManifest(['talents.call']);
      const fakeEngine: TalentEngine = {
        name: 'echo',
        execute: async (args) => ({type: 'text', summary: args.msg}),
        toToolDefinition: () => ({
          type: 'function',
          function: {name: 'echo', description: '', parameters: {}},
        }),
      };
      talentRegistry.register(fakeEngine);

      const ctx = sandbox.buildContext(manifest);
      const result = await ctx.talents.call('echo', {msg: 'hello'});
      expect(result.type).toBe('text');
      expect((result as any).summary).toBe('hello');
    });

    it('denies call when not permitted', async () => {
      const manifest = buildManifest([]);
      const ctx = sandbox.buildContext(manifest);
      await expect(ctx.talents.call('echo', {})).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    });

    it('returns error result for unknown talent', async () => {
      const manifest = buildManifest(['talents.call']);
      const ctx = sandbox.buildContext(manifest);
      const result = await ctx.talents.call('nonexistent', {});
      expect(result.type).toBe('error');
      expect((result as any).errorMessage).toContain('Unknown talent');
    });
  });

  describe('tokens (no permission needed)', () => {
    it('returns light tokens for light mode', () => {
      const manifest = buildManifest([]);
      const ctx = sandbox.buildContext(manifest);
      const tokens = ctx.tokens.get('light');
      expect(tokens.colors).toBeDefined();
      expect(tokens.spacing).toBeDefined();
      expect(tokens.typography).toBeDefined();
    });

    it('returns dark tokens for dark mode', () => {
      const manifest = buildManifest([]);
      const ctx = sandbox.buildContext(manifest);
      const tokens = ctx.tokens.get('dark');
      expect(tokens.colors).toBeDefined();
    });

    it('returns different color values for light vs dark', () => {
      const manifest = buildManifest([]);
      const ctx = sandbox.buildContext(manifest);
      const light = ctx.tokens.get('light');
      const dark = ctx.tokens.get('dark');
      // primary should differ between light and dark
      expect(light.colors.primary).not.toBe(dark.colors.primary);
    });
  });

  describe('logger', () => {
    it('exposes debug/info/warn/error methods', () => {
      const manifest = buildManifest(['logger']);
      const ctx = sandbox.buildContext(manifest);
      expect(typeof ctx.logger.debug).toBe('function');
      expect(typeof ctx.logger.info).toBe('function');
      expect(typeof ctx.logger.warn).toBe('function');
      expect(typeof ctx.logger.error).toBe('function');
    });

    it('does not throw when called', () => {
      const manifest = buildManifest(['logger']);
      const ctx = sandbox.buildContext(manifest);
      expect(() => ctx.logger.info('test message')).not.toThrow();
    });
  });

  describe('manifest passthrough', () => {
    it('exposes the manifest on the context', () => {
      const manifest = buildManifest([]);
      const ctx = sandbox.buildContext(manifest);
      expect(ctx.manifest).toBe(manifest);
      expect(ctx.manifest.id).toBe('com.example.test');
    });
  });
});
