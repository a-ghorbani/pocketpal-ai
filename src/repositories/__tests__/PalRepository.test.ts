const mockFind = jest.fn();

jest.mock('../../database', () => ({
  database: {
    write: (callback: () => Promise<unknown>) => callback(),
    collections: {
      get: () => ({
        find: (id: string) => mockFind(id),
      }),
    },
  },
}));

import {palRepository} from '../PalRepository';

const makeRecord = () => {
  const record: Record<string, unknown> & {
    update: (mutator: (r: any) => void) => Promise<unknown>;
    toPal: () => unknown;
  } = {
    description: 'Tells stories',
    originalSystemPrompt: 'You are {{hero}}.',
    pact: '{"talents":[{"name":"web_search","necessity":"required"}]}',
    greeting: '{"text":"Hello"}',
    defaultModel: '{"id":"a/m1"}',
    generationSettings: '{"temperature":0.5}',
    update: async mutator => {
      mutator(record);
      return record;
    },
    toPal: () => ({}),
  };
  return record;
};

describe('PalRepository.updatePal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes every clear value past the undefined guard', async () => {
    const record = makeRecord();
    mockFind.mockResolvedValue(record);

    await palRepository.updatePal('local-1', {
      pact: {talents: []},
      description: '',
      originalSystemPrompt: '',
      greeting: null,
      defaultModel: null,
      rawPalshubGenerationSettings: null,
    });

    expect(mockFind).toHaveBeenCalledWith('local-1');
    expect(record).toMatchObject({
      pact: '{"talents":[]}',
      description: '',
      originalSystemPrompt: '',
    });
    expect(record).toHaveProperty('greeting', undefined);
    expect(record).toHaveProperty('defaultModel', undefined);
    expect(record).toHaveProperty('generationSettings', undefined);
  });

  it('leaves fields that are not in the update', async () => {
    const record = makeRecord();
    mockFind.mockResolvedValue(record);

    await palRepository.updatePal('local-1', {name: 'Renamed'});

    expect(record).toMatchObject({
      name: 'Renamed',
      greeting: '{"text":"Hello"}',
      defaultModel: '{"id":"a/m1"}',
      generationSettings: '{"temperature":0.5}',
    });
  });
});
