import {runInAction} from 'mobx';

import {palStore, promptHash, settingsHash} from '../PalStore';
import {defaultCompletionParams} from '../../utils/completionSettingsVersions';
import {palsHubService} from '../../services';
import {palRepository} from '../../repositories/PalRepository';
import type {Pal} from '../../types/pal';
import type {Model} from '../../utils/types';
import type {PalsHubPal} from '../../types/palshub';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    clear: jest.fn(async () => values.clear()),
  };
});

const mockDb: Pal[] = [];

jest.mock('../../repositories/PalRepository', () => ({
  palRepository: {
    getAllPals: jest.fn(async () => []),
    checkAndMigrateFromJSON: jest.fn(async () => false),
    getPalByPalshubId: jest.fn(
      async (id: string) => mockDb.find(p => p.palshub_id === id) ?? null,
    ),
    createPal: jest.fn(async (data: Omit<Pal, 'id'>) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      const pal = {...data, id: `local-${mockDb.length + 1}`} as Pal;
      mockDb.push(pal);
      return pal;
    }),
    updatePal: jest.fn(async (id: string, updates: Partial<Pal>) => {
      const index = mockDb.findIndex(p => p.id === id);
      mockDb[index] = {...mockDb[index], ...updates};
      return mockDb[index];
    }),
    deletePal: jest.fn(async () => true),
  },
}));

jest.mock('../../utils/hfResolve', () => ({
  resolveHFModelForDownload: jest.fn().mockRejectedValue(new Error('offline')),
}));

jest.mock('../../utils/imageUtils', () => ({
  downloadPalThumbnail: jest.fn(async () => 'pal-images/thumb.png'),
  deletePalThumbnail: jest.fn(),
}));

jest.mock('../../services', () => ({
  palsHubService: {checkPalOwnership: jest.fn()},
}));

jest.mock('mobx-persist-store', () => ({makePersistable: jest.fn()}));

const templated = (defaults: Record<string, string>) => `{{! json-schema-start
${JSON.stringify(
  Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      {label: key, type: 'text', required: false, default: value},
    ]),
  ),
)}
json-schema-end }}
You are {{${Object.keys(defaults).join('}} and {{')}}}.`;

const hubPal = (overrides: Partial<PalsHubPal> = {}): PalsHubPal => ({
  type: 'palshub',
  id: 'hub-1',
  creator_id: 'creator',
  title: 'Story Pal',
  description: 'Tells stories',
  protection_level: 'reveal_on_purchase',
  price_cents: 499,
  allow_fork: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  system_prompt: 'You tell stories.',
  ...overrides,
});

describe('PalStore owned install', () => {
  beforeEach(async () => {
    await palStore.ready;
    jest.clearAllMocks();
    mockDb.length = 0;
    runInAction(() => {
      palStore.pals = [];
    });
  });

  it('exposes readiness as the initialize promise', async () => {
    await expect(palStore.ready).resolves.toBeUndefined();
  });

  it('installs without an ownership check', async () => {
    const {localPal, applied} = await palStore.installOwnedPal(hubPal());

    expect(palsHubService.checkPalOwnership).not.toHaveBeenCalled();
    expect(localPal.palshub_id).toBe('hub-1');
    expect(localPal.systemPrompt).toBe('You tell stories.');
    expect(localPal.thumbnail_url).toBeUndefined();
    expect(applied).toEqual({
      promptHash: promptHash('You tell stories.'),
      modelKey: '',
      settingsHash: settingsHash(undefined),
    });
    expect(palStore.pals).toHaveLength(1);
  });

  it('creates one local Pal for two concurrent installs', async () => {
    const [first, second] = await Promise.all([
      palStore.installOwnedPal(hubPal()),
      palStore.installOwnedPal(hubPal()),
    ]);

    expect(palRepository.createPal).toHaveBeenCalledTimes(1);
    expect(first.localPal.id).toBe(second.localPal.id);
    expect(palStore.pals).toHaveLength(1);
  });

  it('creates one local Pal when install and library download race', async () => {
    (palsHubService.checkPalOwnership as jest.Mock).mockResolvedValue({
      owned: true,
    });
    await Promise.all([
      palStore.installOwnedPal(hubPal()),
      palStore.downloadPalsHubPal(hubPal()),
    ]);
    expect(palRepository.createPal).toHaveBeenCalledTimes(1);
  });

  it('returns a Pal that exists only in the database', async () => {
    mockDb.push({
      type: 'local',
      id: 'db-only',
      name: 'Story Pal',
      systemPrompt: 'You tell stories.',
      isSystemPromptChanged: false,
      useAIPrompt: false,
      parameters: {},
      parameterSchema: [],
      source: 'palshub',
      palshub_id: 'hub-1',
    } as Pal);

    const {localPal} = await palStore.installOwnedPal(hubPal(), {
      promptHash: promptHash('You tell stories.'),
    });

    expect(localPal.id).toBe('db-only');
    expect(palRepository.createPal).not.toHaveBeenCalled();
    expect(palStore.getPalById('db-only')).toBeDefined();
  });

  it('never installs a Pal with an empty prompt', async () => {
    await expect(
      palStore.installOwnedPal(hubPal({system_prompt: ''})),
    ).rejects.toThrow();
    expect(palRepository.createPal).not.toHaveBeenCalled();
  });

  describe('settingsHash', () => {
    it('ignores key order at every level', () => {
      expect(settingsHash({temperature: 0.5, extra: {a: 1, b: [1, 2]}})).toBe(
        settingsHash({extra: {b: [1, 2], a: 1}, temperature: 0.5}),
      );
    });

    it('changes when a nested value changes', () => {
      expect(settingsHash({extra: {a: 1}})).not.toBe(
        settingsHash({extra: {a: 2}}),
      );
    });

    it('treats a settings object merged with the defaults as the same', () => {
      expect(settingsHash({...defaultCompletionParams, temperature: 0.5})).toBe(
        settingsHash({temperature: 0.5}),
      );
    });
  });

  describe('user-owned model and settings', () => {
    const modelRef = (repo: string, filename: string) => ({
      repo_id: repo,
      filename,
      author: repo,
      downloadUrl: `https://example.com/${filename}`,
      size: 1,
    });
    const userModel = {id: 'b/mine'} as Model;
    const s1 = {temperature: 0.5};
    const s2 = {temperature: 0.9};

    const install = (overrides: Partial<PalsHubPal> = {}) =>
      palStore.installOwnedPal(
        hubPal({
          model_reference: modelRef('a', 'm1'),
          model_settings: s1,
          ...overrides,
        }),
      );

    const current = (id: string) => palStore.getPalById(id)!;

    it('keeps a model the user chose and updates untouched settings', async () => {
      const {localPal, applied} = await install();
      expect(applied.modelKey).toBe('a/m1');
      await palStore.updatePal(localPal.id, {defaultModel: userModel});

      const next = await palStore.applyOwnedPalContent(
        localPal.id,
        hubPal({model_reference: modelRef('a', 'm2'), model_settings: s2}),
        applied,
      );

      expect(current(localPal.id).defaultModel?.id).toBe('b/mine');
      expect(current(localPal.id).rawPalshubGenerationSettings).toEqual(s2);
      expect(next).toEqual({
        ...applied,
        modelKey: 'a/m1',
        settingsHash: settingsHash(s2),
      });
    });

    it('keeps settings the user changed and updates an untouched model', async () => {
      const {localPal, applied} = await install();
      await palStore.updatePal(localPal.id, {
        rawPalshubGenerationSettings: {temperature: 0.1},
      });

      const next = await palStore.applyOwnedPalContent(
        localPal.id,
        hubPal({model_reference: modelRef('a', 'm2'), model_settings: s2}),
        applied,
      );

      expect(current(localPal.id).defaultModel?.id).toBe('a/m2');
      expect(current(localPal.id).rawPalshubGenerationSettings).toEqual({
        temperature: 0.1,
      });
      expect(next.modelKey).toBe('a/m2');
      expect(next.settingsHash).toBe(applied.settingsHash);
    });

    it('still updates settings after an editor save that changed none', async () => {
      const {localPal, applied} = await install();
      await palStore.updatePal(localPal.id, {
        name: 'Renamed',
        rawPalshubGenerationSettings: {...defaultCompletionParams, ...s1},
      });

      const next = await palStore.applyOwnedPalContent(
        localPal.id,
        hubPal({model_reference: modelRef('a', 'm1'), model_settings: s2}),
        applied,
      );

      expect(current(localPal.id).rawPalshubGenerationSettings).toEqual(s2);
      expect(next.settingsHash).toBe(settingsHash(s2));
    });

    it('advances the key when the user already picked the new model', async () => {
      const {localPal, applied} = await install();
      await palStore.updatePal(localPal.id, {
        defaultModel: {id: 'a/m2'} as Model,
      });

      const next = await palStore.applyOwnedPalContent(
        localPal.id,
        hubPal({model_reference: modelRef('a', 'm2'), model_settings: s1}),
        applied,
      );

      expect(next.modelKey).toBe('a/m2');
    });

    it('keeps a changed model when the creator removes theirs', async () => {
      const {localPal, applied} = await install();
      await palStore.updatePal(localPal.id, {defaultModel: userModel});

      const next = await palStore.applyOwnedPalContent(
        localPal.id,
        hubPal({model_reference: undefined, model_settings: s1}),
        applied,
      );

      const updates = (palRepository.updatePal as jest.Mock).mock.calls.at(
        -1,
      )[1];
      expect(updates).not.toHaveProperty('defaultModel');
      expect(current(localPal.id).defaultModel?.id).toBe('b/mine');
      expect(next.modelKey).toBe('a/m1');
    });

    it('keeps a user model when the record predates model tracking', async () => {
      const {localPal, applied} = await install();
      await palStore.updatePal(localPal.id, {defaultModel: userModel});

      const next = await palStore.applyOwnedPalContent(
        localPal.id,
        hubPal({model_reference: modelRef('a', 'm2'), model_settings: s1}),
        {promptHash: applied.promptHash},
      );

      expect(current(localPal.id).defaultModel?.id).toBe('b/mine');
      expect(next.modelKey).toBeUndefined();
    });
  });

  describe('applyOwnedPalContent', () => {
    const installWith = async (prompt: string) => {
      const {localPal} = await palStore.installOwnedPal(
        hubPal({system_prompt: prompt}),
      );
      return localPal;
    };

    it('replaces a prompt whose hash matches the applied hash', async () => {
      const local = await installWith('Version one.');

      const {promptHash: hash} = await palStore.applyOwnedPalContent(
        local.id,
        hubPal({title: 'Story Pal 2', system_prompt: 'Version two.'}),
        {promptHash: promptHash('Version one.')},
      );

      expect(hash).toBe(promptHash('Version two.'));
      const updated = palStore.getPalById(local.id)!;
      expect(updated.systemPrompt).toBe('Version two.');
      expect(updated.name).toBe('Story Pal 2');
    });

    it('keeps a prompt the user edited', async () => {
      const local = await installWith('Version one.');
      await palStore.updatePal(local.id, {systemPrompt: 'My own prompt.'});

      const {promptHash: hash} = await palStore.applyOwnedPalContent(
        local.id,
        hubPal({description: 'New description', system_prompt: 'Version two.'}),
        {promptHash: promptHash('Version one.')},
      );

      expect(hash).toBe(promptHash('Version one.'));
      const updated = palStore.getPalById(local.id)!;
      expect(updated.systemPrompt).toBe('My own prompt.');
      expect(updated.description).toBe('New description');
    });

    it('never writes an empty prompt', async () => {
      const local = await installWith('Version one.');

      await palStore.applyOwnedPalContent(
        local.id,
        hubPal({system_prompt: undefined}),
        {promptHash: promptHash('Version one.')},
      );

      const updates = (palRepository.updatePal as jest.Mock).mock.calls.at(
        -1,
      )[1];
      expect(updates).not.toHaveProperty('systemPrompt');
      expect(palStore.getPalById(local.id)!.systemPrompt).toBe('Version one.');
    });

    it('keeps user parameters for keys the new schema still has', async () => {
      const first = templated({hero: 'Knight', place: 'Castle'});
      const {localPal, applied} = await palStore.installOwnedPal(
        hubPal({system_prompt: first}),
      );
      await palStore.updatePal(localPal.id, {
        parameters: {hero: 'Dragon', place: 'Cave'},
      });

      await palStore.applyOwnedPalContent(
        localPal.id,
        hubPal({system_prompt: templated({hero: 'Knight', era: 'Future'})}),
        applied,
      );

      expect(palStore.getPalById(localPal.id)!.parameters).toEqual({
        hero: 'Dragon',
        era: 'Future',
      });
    });
  });
});
