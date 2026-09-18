import {runInAction} from 'mobx';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';

// The shared async-storage mock resolves its own import back through
// moduleNameMapper, so its default export is undefined. Mock it locally
// rather than repairing shared test infra that other suites rely on.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {getItem: jest.fn(), setItem: jest.fn()},
}));

import {CustomToolStore, keychainService} from '../CustomToolStore';
import {toolStatus} from '../../services/customTools/toolStatus';
import type {CustomToolDefinition} from '../../services/customTools/types';

const persistMock = makePersistable as jest.Mock;
const setMock = Keychain.setGenericPassword as jest.Mock;
const getMock = Keychain.getGenericPassword as jest.Mock;
const resetMock = Keychain.resetGenericPassword as jest.Mock;
const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;

const flush = () => new Promise(resolve => setImmediate(resolve));

const validDraft = (overrides: Record<string, unknown> = {}) => ({
  name: 'get_time',
  description: 'Read the demo server clock',
  parameters: {type: 'object', properties: {}},
  request: {method: 'GET', url: 'http://127.0.0.1:8765/time'},
  ...overrides,
});

const secretDraft = () => ({
  name: 'get_weather',
  description: 'Get weather for a city',
  parameters: {
    type: 'object',
    properties: {city: {type: 'string'}},
    required: ['city'],
  },
  request: {
    method: 'GET',
    url: 'https://api.example.com/weather',
    query: {city: '{{city}}'},
    headers: {Authorization: 'Bearer {{secret.API_KEY}}'},
  },
  requiresConfirmation: false,
});

describe('CustomToolStore', () => {
  /** In-memory stand-in for the Keychain, so reads see prior writes. */
  let vault: Record<string, string>;

  const newStore = async () => {
    const store = new CustomToolStore();
    await flush();
    return store;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    vault = {};
    getMock.mockImplementation(async ({service}: {service: string}) =>
      vault[service]
        ? {username: 'custom-tool', password: vault[service]}
        : false,
    );
    setMock.mockImplementation(
      async (_user: string, password: string, {service}: {service: string}) => {
        vault[service] = password;
      },
    );
    resetMock.mockImplementation(async ({service}: {service: string}) => {
      delete vault[service];
    });
    getItemMock.mockResolvedValue(null);
    setItemMock.mockResolvedValue(undefined);
  });

  describe('persistence boundary', () => {
    it('persists only the definitions', async () => {
      await newStore();
      const config = persistMock.mock.calls.at(-1)![1];
      expect(config.properties).toEqual(['tools']);
    });
  });

  describe('CRUD', () => {
    it('adds a valid tool with a fresh id', async () => {
      const store = await newStore();
      const result = store.addTool(validDraft());
      expect(result.ok).toBe(true);
      expect(store.tools).toHaveLength(1);
      expect(store.tools[0].id).toBeTruthy();
    });

    it('refuses a built-in name and writes nothing', async () => {
      const store = await newStore();
      const result = store.addTool(validDraft({name: 'calculate'}));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.issues.map(i => i.code)).toContain(
        'name_builtin',
      );
      expect(store.tools).toHaveLength(0);
    });

    it('keeps the id stable across a rename', async () => {
      const store = await newStore();
      const added = store.addTool(validDraft());
      const id = added.ok ? added.value.id : '';
      store.updateTool(id, validDraft({name: 'get_clock'}));
      expect(store.tools).toHaveLength(1);
      expect(store.tools[0].id).toBe(id);
      expect(store.tools[0].name).toBe('get_clock');
    });

    it('refuses a rename onto a peer name', async () => {
      const store = await newStore();
      store.addTool(validDraft({name: 'first'}));
      const second = store.addTool(validDraft({name: 'second'}));
      const id = second.ok ? second.value.id : '';
      const result = store.updateTool(id, validDraft({name: 'first'}));
      expect(result.ok).toBe(false);
      expect(store.tools[1].name).toBe('second');
    });

    it('removeTool deletes the definition and its Keychain entry', async () => {
      const store = await newStore();
      const added = store.addTool(validDraft());
      const id = added.ok ? added.value.id : '';
      await store.setSecrets(id, {API_KEY: 'abcd1234'});
      await store.removeTool(id);
      expect(store.tools).toHaveLength(0);
      expect(resetMock).toHaveBeenCalledWith({service: keychainService(id)});
      expect(vault[keychainService(id)]).toBeUndefined();
    });
  });

  describe('export / import round trip', () => {
    it('exports placeholders without ids or values, and import re-gates', async () => {
      const source = await newStore();
      const added = source.addTool(secretDraft());
      const id = added.ok ? added.value.id : '';
      await source.setSecrets(id, {API_KEY: 'k-123456'});
      expect(source.tools[0].requiresConfirmation).toBe(false);

      const file = source.exportTools();
      const serialised = JSON.stringify(file);
      expect(serialised).toContain('{{secret.API_KEY}}');
      expect(serialised).not.toContain('k-123456');
      expect(file.tools[0]).not.toHaveProperty('id');

      const target = await newStore();
      const report = target.importTools(JSON.parse(serialised));
      expect(report.rejected).toHaveLength(0);
      expect(report.imported).toHaveLength(1);
      expect(target.tools[0].requiresConfirmation).toBe(true);
      expect(target.tools[0].id).not.toBe(id);
      await expect(target.getSecrets(target.tools[0].id)).resolves.toEqual({});
    });

    it('reports each rejected tool by name and accepts the rest', async () => {
      const store = await newStore();
      const report = store.importTools({
        version: 1,
        tools: [validDraft(), validDraft({name: 'calculate'})],
      });
      expect(report.imported).toHaveLength(1);
      expect(report.rejected).toHaveLength(1);
      expect(report.rejected[0].name).toBe('calculate');
      expect(report.rejected[0].issues[0].code).toBe('name_builtin');
    });

    it('accepts a single definition object', async () => {
      const store = await newStore();
      expect(store.importTools(validDraft()).imported).toHaveLength(1);
    });

    it('forces wrapUntrusted on, whatever the file asked for', async () => {
      const store = await newStore();
      const report = store.importTools({
        ...validDraft(),
        response: {extract: '$.current', wrapUntrusted: false},
        requiresConfirmation: false,
      });

      expect(report.imported).toHaveLength(1);
      expect(store.tools[0].response?.wrapUntrusted).toBe(true);
      expect(store.tools[0].requiresConfirmation).toBe(true);
      expect(store.tools[0].id).toBeTruthy();
      await expect(store.getSecrets(store.tools[0].id)).resolves.toEqual({});
    });
  });

  describe('hydration never deletes', () => {
    it('keeps an entry whose name a built-in now claims, unregistered', async () => {
      const store = await newStore();
      const hydrated = {
        ...validDraft({name: 'calculate'}),
        id: 'persisted-1',
        timeoutMs: 15000,
        requiresConfirmation: true,
      } as CustomToolDefinition;
      runInAction(() => {
        store.tools = [hydrated];
      });

      expect(store.tools).toHaveLength(1);
      expect(toolStatus(store.tools[0], store.tools)).toEqual({
        kind: 'name_conflict',
      });
      expect(store.okTools).toHaveLength(0);
    });

    it('keeps an entry that no longer passes the validator', async () => {
      const store = await newStore();
      const stale = {
        ...validDraft(),
        request: {method: 'GET', url: 'ftp://nope/x'},
        id: 'persisted-2',
        timeoutMs: 15000,
        requiresConfirmation: true,
      } as unknown as CustomToolDefinition;
      runInAction(() => {
        store.tools = [stale];
      });

      expect(store.tools).toHaveLength(1);
      expect(toolStatus(store.tools[0], store.tools).kind).toBe('invalid');
      expect(store.okTools).toHaveLength(0);
    });

    it('keeps the first of two same-named entries registrable', async () => {
      const store = await newStore();
      const base = {timeoutMs: 15000, requiresConfirmation: true};
      runInAction(() => {
        store.tools = [
          {...validDraft({name: 'dup'}), id: 'a', ...base},
          {...validDraft({name: 'dup'}), id: 'b', ...base},
        ] as CustomToolDefinition[];
      });

      expect(store.tools).toHaveLength(2);
      expect(store.okTools.map(tool => tool.id)).toEqual(['a']);
    });
  });

  describe('secrets', () => {
    const idOf = (store: CustomToolStore) => store.tools[0].id;

    it('rejects the whole patch when a value is too short, writing nothing', async () => {
      const store = await newStore();
      store.addTool(validDraft());
      const ok = await store.setSecrets(idOf(store), {A: 'good1234', K: 'abc'});
      expect(ok).toBe(false);
      expect(setMock).not.toHaveBeenCalled();
      expect(vault).toEqual({});
    });

    it('rejects a value containing CR or LF, writing nothing', async () => {
      const store = await newStore();
      store.addTool(validDraft());
      const ok = await store.setSecrets(idOf(store), {K: 'abcd\r\nevil'});
      expect(ok).toBe(false);
      expect(setMock).not.toHaveBeenCalled();
    });

    it('does not lose an update when two saves race', async () => {
      const store = await newStore();
      store.addTool(validDraft());
      const id = idOf(store);
      await Promise.all([
        store.setSecrets(id, {A: 'aaaa1111'}),
        store.setSecrets(id, {B: 'bbbb2222'}),
      ]);
      await expect(store.getSecrets(id)).resolves.toEqual({
        A: 'aaaa1111',
        B: 'bbbb2222',
      });
    });

    it('clears one name with null and removes the entry when none remain', async () => {
      const store = await newStore();
      store.addTool(validDraft());
      const id = idOf(store);
      await store.setSecrets(id, {A: 'aaaa1111', B: 'bbbb2222'});
      await store.setSecrets(id, {A: null});
      await expect(store.getSecrets(id)).resolves.toEqual({B: 'bbbb2222'});
      await store.setSecrets(id, {B: null});
      expect(vault[keychainService(id)]).toBeUndefined();
    });

    it('reports which referenced names are set, never their values', async () => {
      const store = await newStore();
      store.addTool(secretDraft());
      const id = idOf(store);
      await expect(store.getSecretNames(id)).resolves.toEqual([]);
      await store.setSecrets(id, {API_KEY: 'k-123456'});
      await expect(store.getSecretNames(id)).resolves.toEqual(['API_KEY']);
    });

    it('ignores an unparsable Keychain payload rather than throwing', async () => {
      const store = await newStore();
      store.addTool(validDraft());
      const id = idOf(store);
      vault[keychainService(id)] = 'not-json';
      await expect(store.getSecrets(id)).resolves.toEqual({});
    });
  });

  describe('unreadable persisted blob', () => {
    const backupsWritten = () =>
      setItemMock.mock.calls.filter(([key]) =>
        String(key).startsWith('custom-tools-unreadable-'),
      );

    it('copies the blob aside verbatim, with no user action', async () => {
      getItemMock.mockResolvedValue('{not valid json');
      await newStore();

      expect(backupsWritten()).toHaveLength(1);
      expect(backupsWritten()[0][1]).toBe('{not valid json');
    });

    it('decides on the raw bytes, without driving the constructor', async () => {
      const store = await newStore();

      await expect(store.handlePersistedBlob('{not valid json')).resolves.toBe(
        true,
      );
      await expect(
        store.handlePersistedBlob(JSON.stringify({tools: []})),
      ).resolves.toBe(false);
    });

    it('completes the backup write before makePersistable is called', async () => {
      getItemMock.mockResolvedValue('{not valid json');
      let releaseBackup = () => {};
      setItemMock.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            releaseBackup = resolve;
          }),
      );

      new CustomToolStore();
      await flush();

      expect(backupsWritten()).toHaveLength(1);
      expect(persistMock).not.toHaveBeenCalled();

      releaseBackup();
      await flush();

      expect(persistMock).toHaveBeenCalledTimes(1);
      expect(setItemMock.mock.invocationCallOrder[0]).toBeLessThan(
        persistMock.mock.invocationCallOrder[0],
      );
    });

    it('writes no backup when nothing is persisted', async () => {
      getItemMock.mockResolvedValue(undefined);
      await newStore();

      expect(backupsWritten()).toHaveLength(0);
    });

    it('writes no backup when the persisted blob is readable', async () => {
      getItemMock.mockResolvedValue(JSON.stringify({tools: []}));
      const store = await newStore();
      store.addTool(validDraft());
      await flush();

      expect(backupsWritten()).toHaveLength(0);
    });
  });
});
