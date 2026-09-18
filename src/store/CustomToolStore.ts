import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';
import {v4 as uuidv4} from 'uuid';

import {validateDefinition} from '../services/customTools/validator';
import {secretNames, toolStatus} from '../services/customTools/toolStatus';
import type {
  CustomToolDefinition,
  ValidationIssue,
  ValidationResult,
} from '../services/customTools/types';

const STORAGE_KEY = 'CustomToolStore';
const SCHEMA_VERSION = 1;
const EXPORT_VERSION = 1;
const MIN_SECRET_LENGTH = 4;

/** One Keychain entry per tool, keyed by the id so a rename keeps the secrets. */
const keychainService = (id: string): string => `pocketpal-custom-tool-${id}`;

export interface ImportReport {
  imported: CustomToolDefinition[];
  rejected: Array<{name: string; issues: ValidationIssue[]}>;
}

export interface CustomToolExport {
  version: number;
  tools: Array<Omit<CustomToolDefinition, 'id'>>;
}

const candidateList = (input: unknown): unknown[] => {
  if (Array.isArray(input)) {
    return input;
  }
  if (input && typeof input === 'object') {
    const tools = (input as {tools?: unknown}).tools;
    if (Array.isArray(tools)) {
      return tools;
    }
    return [input];
  }
  return [];
};

const candidateName = (candidate: unknown): string => {
  const name = (candidate as {name?: unknown})?.name;
  return typeof name === 'string' ? name : '';
};

const isUnreadable = (raw: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(raw);
    const tools = (parsed as {tools?: unknown})?.tools;
    return !parsed || typeof parsed !== 'object' || !Array.isArray(tools);
  } catch {
    return true;
  }
};

class CustomToolStore {
  schemaVersion = SCHEMA_VERSION;
  tools: CustomToolDefinition[] = [];

  /** Serialises Keychain read-modify-write per tool id. */
  private chains = new Map<string, Promise<unknown>>();

  constructor() {
    makeAutoObservable(this);
    this.initPersistence();
  }

  /**
   * The backup is awaited before `makePersistable`, because that setup is the
   * write which would overwrite the blob it preserves.
   */
  private async initPersistence(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    await this.handlePersistedBlob(raw);

    makePersistable(this, {
      name: STORAGE_KEY,
      properties: ['schemaVersion', 'tools'],
      storage: AsyncStorage,
    });
  }

  /** Copies an unreadable blob aside verbatim; reports whether it wrote one. */
  async handlePersistedBlob(raw: string | null): Promise<boolean> {
    if (raw == null || !isUnreadable(raw)) {
      return false;
    }
    try {
      await AsyncStorage.setItem(`custom-tools-unreadable-${Date.now()}`, raw);
      return true;
    } catch (error) {
      console.error('Failed to back up unreadable custom tools blob:', error);
      return false;
    }
  }

  private runOnChain<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(id) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.chains.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  get toolCount(): number {
    return this.tools.length;
  }

  /** The tools the registry bridge may register; the rest stay listed and badged. */
  get okTools(): CustomToolDefinition[] {
    return this.tools.filter(
      tool => toolStatus(tool, this.tools).kind === 'ok',
    );
  }

  peerNamesExcluding(id?: string): string[] {
    return this.tools.filter(tool => tool.id !== id).map(tool => tool.name);
  }

  addTool(input: unknown): ValidationResult<CustomToolDefinition> {
    const result = validateDefinition(input, {
      peerNames: this.peerNamesExcluding(),
    });
    if (!result.ok) {
      return result;
    }
    const tool: CustomToolDefinition = {...result.value, id: uuidv4()};
    runInAction(() => {
      this.tools = [...this.tools, tool];
    });
    return {ok: true, value: tool};
  }

  updateTool(
    id: string,
    input: unknown,
  ): ValidationResult<CustomToolDefinition> {
    const result = validateDefinition(input, {
      peerNames: this.peerNamesExcluding(id),
    });
    if (!result.ok) {
      return result;
    }
    if (!this.tools.some(tool => tool.id === id)) {
      return {ok: false, issues: [{code: 'shape_invalid'}]};
    }
    const tool: CustomToolDefinition = {...result.value, id};
    runInAction(() => {
      this.tools = this.tools.map(existing =>
        existing.id === id ? tool : existing,
      );
    });
    return {ok: true, value: tool};
  }

  /**
   * The only path that deletes a definition. The Keychain entry goes on the
   * same per-id chain so it cannot interleave with a `setSecrets` save.
   */
  async removeTool(id: string): Promise<void> {
    await this.runOnChain(id, async () => {
      runInAction(() => {
        this.tools = this.tools.filter(tool => tool.id !== id);
      });
      try {
        await Keychain.resetGenericPassword({service: keychainService(id)});
      } catch (error) {
        console.error('Failed to remove custom tool secrets:', error);
      }
    });
  }

  /**
   * Imported tools get fresh ids, no secrets, and confirmation forced on, so a
   * shared file can never silently disable the gate.
   */
  importTools(input: unknown): ImportReport {
    const report: ImportReport = {imported: [], rejected: []};
    const peerNames = new Set(this.tools.map(tool => tool.name));

    for (const candidate of candidateList(input)) {
      const result = validateDefinition(candidate, {peerNames});
      if (!result.ok) {
        report.rejected.push({
          name: candidateName(candidate),
          issues: result.issues,
        });
        continue;
      }
      const tool: CustomToolDefinition = {
        ...result.value,
        requiresConfirmation: true,
        id: uuidv4(),
      };
      report.imported.push(tool);
      peerNames.add(tool.name);
    }

    if (report.imported.length > 0) {
      runInAction(() => {
        this.tools = [...this.tools, ...report.imported];
      });
    }
    return report;
  }

  /** Placeholders stay literal; no id and no secret value ever leaves here. */
  exportTools(ids?: string[]): CustomToolExport {
    const selected = ids
      ? this.tools.filter(tool => ids.includes(tool.id))
      : this.tools;
    return {
      version: EXPORT_VERSION,
      tools: selected.map(({id: _id, ...rest}) => rest),
    };
  }

  private async readSecrets(id: string): Promise<Record<string, string>> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: keychainService(id),
      });
      if (!credentials) {
        return {};
      }
      const parsed: unknown = JSON.parse(credentials.password);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const secrets: Record<string, string> = {};
      for (const [name, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          secrets[name] = value;
        }
      }
      return secrets;
    } catch (error) {
      console.error('Failed to read custom tool secrets:', error);
      return {};
    }
  }

  /** Read per call by the engine's access object; never mirrored into MobX. */
  getSecrets(id: string): Promise<Record<string, string>> {
    return this.runOnChain(id, () => this.readSecrets(id));
  }

  /** Which referenced names are set, for the editor. Never values. */
  async getSecretNames(id: string): Promise<string[]> {
    const tool = this.tools.find(entry => entry.id === id);
    const referenced = tool ? secretNames(tool) : [];
    const stored = await this.getSecrets(id);
    return referenced.filter(name => (stored[name] ?? '').length > 0);
  }

  /**
   * The only secret writer: one whole-patch write per editor save, so two
   * saves can never lose an update. A single bad value rejects the whole
   * patch and writes nothing.
   */
  async setSecrets(
    id: string,
    patch: Record<string, string | null>,
  ): Promise<boolean> {
    for (const value of Object.values(patch)) {
      if (value === null) {
        continue;
      }
      if (value.length < MIN_SECRET_LENGTH || /[\r\n]/.test(value)) {
        return false;
      }
    }

    return this.runOnChain(id, async () => {
      try {
        const next = await this.readSecrets(id);
        for (const [name, value] of Object.entries(patch)) {
          if (value === null) {
            delete next[name];
          } else {
            next[name] = value;
          }
        }
        if (Object.keys(next).length === 0) {
          await Keychain.resetGenericPassword({service: keychainService(id)});
        } else {
          await Keychain.setGenericPassword(id, JSON.stringify(next), {
            service: keychainService(id),
          });
        }
        return true;
      } catch (error) {
        console.error('Failed to save custom tool secrets:', error);
        return false;
      }
    });
  }
}

export const customToolStore = new CustomToolStore();
export {CustomToolStore, MIN_SECRET_LENGTH, keychainService};
