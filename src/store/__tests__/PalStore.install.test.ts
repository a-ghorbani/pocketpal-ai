import {runInAction} from 'mobx';

import {palStore} from '../PalStore';
import {resolveHFModelForDownload} from '../../utils/hfResolve';
import {downloadPalThumbnail} from '../../utils/imageUtils';
import type {CreatorField} from '../../services/iap/creatorContent';
import {palsHubService} from '../../services';
import {palRepository} from '../../repositories/PalRepository';
import * as templateParser from '../../utils/palshub-template-parser';
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
    const {localPal, created} = await palStore.installOwnedPal(hubPal());

    expect(palsHubService.checkPalOwnership).not.toHaveBeenCalled();
    expect(created).toBe(true);
    expect(localPal.palshub_id).toBe('hub-1');
    expect(localPal.systemPrompt).toBe('You tell stories.');
    expect(localPal.thumbnail_url).toBeUndefined();
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

  it('adopts an existing Pal without writing it', async () => {
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

    const {localPal, created} = await palStore.installOwnedPal(
      hubPal({title: 'New title', system_prompt: 'New prompt.'}),
    );

    expect(localPal.id).toBe('db-only');
    expect(created).toBe(false);
    expect(palRepository.createPal).not.toHaveBeenCalled();
    expect(palRepository.updatePal).not.toHaveBeenCalled();
    expect(localPal.systemPrompt).toBe('You tell stories.');
    expect(palStore.getPalById('db-only')).toBeDefined();
  });

  it('never installs a Pal with an empty prompt', async () => {
    await expect(
      palStore.installOwnedPal(hubPal({system_prompt: ''})),
    ).rejects.toThrow();
    expect(palRepository.createPal).not.toHaveBeenCalled();
  });

  describe('applyCreatorUpdate', () => {
    const modelRef = (filename: string) => ({
      repo_id: 'a',
      filename,
      author: 'a',
      downloadUrl: `https://example.com/${filename}`,
      size: 1,
    });
    const named = (name: string) => ({
      id: name,
      name,
      sort_order: 0,
      created_at: '',
      usage_count: 0,
    });
    const v1 = () =>
      hubPal({
        system_prompt: templated({hero: 'Knight'}),
        thumbnail_url: 'https://example.com/v1.png',
        model_reference: modelRef('m1'),
        model_settings: {temperature: 0.5},
        pact: {version: 1, talents: [{name: 'web_search', required: true}]},
        greeting: {text: 'Hello', suggested_prompts: ['Start']},
        categories: [named('Writing')],
        tags: [named('stories')],
      });
    const userEdits = {
      name: 'My name',
      description: 'My description',
      systemPrompt: 'My prompt.',
      defaultModel: {id: 'b/mine'} as Model,
      rawPalshubGenerationSettings: {temperature: 0.1},
      pact: {talents: [{name: 'calculate', necessity: 'optional' as const}]},
      greeting: {text: 'My greeting'},
      categories: ['Mine'],
      tags: ['mine'],
      creator_info: {id: 'me'},
      protection_level: 'public' as const,
      thumbnail_url: 'pal-images/mine.png',
    };
    const lastUpdates = () =>
      (palRepository.updatePal as jest.Mock).mock.calls.at(-1)[1];

    const installEdited = async () => {
      const {localPal} = await palStore.installOwnedPal(v1());
      await palStore.updatePal(localPal.id, userEdits);
      jest.clearAllMocks();
      return localPal.id;
    };

    it.each<[CreatorField, Partial<PalsHubPal>, Record<string, unknown>]>([
      ['title', {title: 'New title'}, {name: 'New title'}],
      ['description', {description: undefined}, {description: ''}],
      [
        'system_prompt',
        {system_prompt: 'Plain prompt.'},
        {
          systemPrompt: 'Plain prompt.',
          originalSystemPrompt: '',
          parameterSchema: [],
          parameters: {},
        },
      ],
      ['model_reference', {model_reference: undefined}, {defaultModel: null}],
      [
        'model_settings',
        {model_settings: undefined},
        {rawPalshubGenerationSettings: null},
      ],
      ['pact', {pact: undefined}, {pact: {talents: []}}],
      ['greeting', {greeting: undefined}, {greeting: null}],
      ['categories', {categories: []}, {categories: []}],
      ['tags', {tags: [named('tales')]}, {tags: ['tales']}],
      [
        'creator',
        {
          creator_id: 'creator-2',
          creator: {
            id: 'creator-2',
            display_name: 'Bo',
            provider: 'x',
            created_at: '',
            updated_at: '',
          },
        },
        {creator_info: {id: 'creator-2', name: 'Bo', avatar_url: undefined}},
      ],
      [
        'protection_level',
        {protection_level: 'reveal_on_purchase'},
        {protection_level: 'reveal_on_purchase'},
      ],
      [
        'thumbnail_url',
        {thumbnail_url: 'https://example.com/v2.png'},
        {thumbnail_url: 'pal-images/thumb.png'},
      ],
    ])(
      'writes only the %s columns, over the user edit',
      async (field, overrides, expected) => {
        const id = await installEdited();

        await palStore.applyCreatorUpdate(
          id,
          {...v1(), ...overrides},
          new Set([field]),
        );

        expect(lastUpdates()).toEqual(expected);
        const pal = palStore.getPalById(id)!;
        expect(pal).toMatchObject(expected);
        const untouched = Object.fromEntries(
          Object.entries(userEdits).filter(([key]) => !(key in expected)),
        );
        expect(pal).toMatchObject(untouched);
      },
    );

    it('keeps the thumbnail when the creator removed it', async () => {
      const id = await installEdited();

      await palStore.applyCreatorUpdate(
        id,
        {...v1(), thumbnail_url: undefined},
        new Set<CreatorField>(['thumbnail_url']),
      );

      expect(lastUpdates()).toEqual({});
      expect(palStore.getPalById(id)!.thumbnail_url).toBe(
        'pal-images/mine.png',
      );
    });

    it('reports a failed thumbnail and still writes the other fields', async () => {
      const id = await installEdited();
      (downloadPalThumbnail as jest.Mock).mockRejectedValueOnce(
        new Error('offline'),
      );

      const outcome = await palStore.applyCreatorUpdate(
        id,
        {
          ...v1(),
          title: 'New title',
          thumbnail_url: 'https://example.com/v2.png',
        },
        new Set<CreatorField>(['title', 'thumbnail_url']),
      );

      expect(outcome).toEqual({thumbnailFailed: true});
      expect(lastUpdates()).toEqual({name: 'New title'});
      expect(palStore.getPalById(id)!.thumbnail_url).toBe(
        'pal-images/mine.png',
      );
    });

    it('writes nothing when a field other than the thumbnail fails', async () => {
      const id = await installEdited();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const spy = jest
        .spyOn(templateParser, 'parsePalsHubTemplate')
        .mockReturnValueOnce({
          cleanSystemPrompt: 'New prompt.',
          parameterSchema: undefined,
          defaultParameters: {},
        } as any);

      await expect(
        palStore.applyCreatorUpdate(
          id,
          {...v1(), title: 'New title'},
          new Set<CreatorField>(['title', 'system_prompt']),
        ),
      ).rejects.toThrow(TypeError);

      expect(palRepository.updatePal).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      spy.mockRestore();
      warn.mockRestore();
    });

    it('reports no failure when the thumbnail downloads', async () => {
      const id = await installEdited();

      const outcome = await palStore.applyCreatorUpdate(
        id,
        {...v1(), thumbnail_url: 'https://example.com/v2.png'},
        new Set<CreatorField>(['thumbnail_url']),
      );

      expect(outcome).toEqual({thumbnailFailed: false});
    });

    it('resolves the model only when it changed', async () => {
      const id = await installEdited();

      await palStore.applyCreatorUpdate(
        id,
        {...v1(), title: 'New title'},
        new Set<CreatorField>(['title']),
      );

      expect(resolveHFModelForDownload).not.toHaveBeenCalled();
    });

    it('writes nothing for an empty field set', async () => {
      const id = await installEdited();

      await palStore.applyCreatorUpdate(id, v1(), new Set());

      expect(palRepository.updatePal).not.toHaveBeenCalled();
    });

    it('replaces an edited prompt and keeps an edited model it did not change', async () => {
      const {localPal} = await palStore.installOwnedPal(
        hubPal({
          system_prompt: 'P1',
          model_reference: modelRef('m1'),
          greeting: {text: 'G1'},
        }),
      );
      await palStore.updatePal(localPal.id, {
        systemPrompt: 'Pu',
        defaultModel: {id: 'b/mine'} as Model,
      });

      await palStore.applyCreatorUpdate(
        localPal.id,
        hubPal({
          system_prompt: 'P2',
          model_reference: modelRef('m1'),
          greeting: undefined,
        }),
        new Set<CreatorField>(['system_prompt', 'greeting']),
      );

      const pal = palStore.getPalById(localPal.id)!;
      expect(pal.systemPrompt).toBe('P2');
      expect(pal.defaultModel?.id).toBe('b/mine');
      expect(pal.greeting).toBeNull();
    });

    it('keeps user parameters for keys the new schema still has', async () => {
      const {localPal} = await palStore.installOwnedPal(
        hubPal({system_prompt: templated({hero: 'Knight', place: 'Castle'})}),
      );
      await palStore.updatePal(localPal.id, {
        parameters: {hero: 'Dragon', place: 'Cave'},
      });

      await palStore.applyCreatorUpdate(
        localPal.id,
        hubPal({system_prompt: templated({hero: 'Knight', era: 'Future'})}),
        new Set<CreatorField>(['system_prompt']),
      );

      expect(palStore.getPalById(localPal.id)!.parameters).toEqual({
        hero: 'Dragon',
        era: 'Future',
      });
    });
  });
});
