import {routerModelsBody} from '../../../../jest/fixtures/remoteModelList';
import {deriveListCaps, deriveListCapsMap} from '../index';
import type {
  ListDerivedCaps,
  RemoteModelCaps,
  RemoteModelInfo,
  ServerConfig,
} from '../../../utils/types';

const routerRow = (id: string): RemoteModelInfo => {
  const row = routerModelsBody.data.find(r => r.id === id);
  if (!row) {
    throw new Error(`fixture has no row ${id}`);
  }
  return row as RemoteModelInfo;
};

const VISION = 'gemma-4-e2b';

describe('deriveListCaps', () => {
  describe('a profile with no row reader', () => {
    it.each(['Ollama', 'LM Studio', 'OpenAI', 'vLLM', undefined])(
      'reads nothing off a %s server',
      serverType => {
        // The fully-populated router row: everything to parse, and a profile
        // without a row reader parses none of it.
        expect(deriveListCaps(routerRow(VISION), serverType)).toEqual({
          tier: 'list',
        });
      },
    );

    it('reads nothing off an absent row', () => {
      expect(deriveListCaps(undefined, 'llama.cpp')).toEqual({tier: 'list'});
    });
  });

  describe('the tier brand', () => {
    it('is enforced by the compiler, not at runtime', () => {
      const listed: ListDerivedCaps = {tier: 'list', supportsVision: true};
      const probed: RemoteModelCaps = {supportsVision: true};

      // @ts-expect-error a list answer must never pass as a probed one
      const asProbed: RemoteModelCaps = listed;
      // @ts-expect-error and a probed answer is not a list answer either
      const asListed: ListDerivedCaps = probed;

      expect([asProbed, asListed]).toHaveLength(2);
    });
  });
});

describe('deriveListCapsMap', () => {
  const servers: ServerConfig[] = [
    {id: 'srv-1', name: 'router', url: 'http://x', serverType: 'llama.cpp'},
    {id: 'srv-2', name: 'ollama', url: 'http://y', serverType: 'Ollama'},
  ];
  const rows = routerModelsBody.data as RemoteModelInfo[];
  const serverModels = new Map<string, RemoteModelInfo[]>([
    ['srv-1', rows],
    ['srv-2', rows],
  ]);

  it('keys every model by the id its card carries', () => {
    const map = deriveListCapsMap(servers, serverModels);

    expect(map[`srv-1/${VISION}`]).toEqual({
      tier: 'list',
      supportsVision: true,
      contextLength: 8192,
    });
  });

  it('applies each server own type to its own rows', () => {
    const map = deriveListCapsMap(servers, serverModels);

    expect(map[`srv-2/${VISION}`]).toEqual({tier: 'list'});
  });

  it('omits servers that have not been fetched yet', () => {
    const map = deriveListCapsMap(servers, new Map());

    expect(Object.keys(map)).toHaveLength(0);
  });
});
