import {
  directTextModelsBody,
  directVisionModelsBody,
  routerModelsBody,
} from '../../../jest/fixtures/remoteModelList';
import {deriveListCaps, deriveListCapsMap} from '../listCaps';
import type {ListDerivedCaps} from '../listCaps';
import type {RemoteModelCaps, ServerConfig} from '../types';

import type {RemoteModelInfo} from '../../api/openai';

const routerRow = (id: string): RemoteModelInfo => {
  const row = routerModelsBody.data.find(r => r.id === id);
  if (!row) {
    throw new Error(`fixture has no row ${id}`);
  }
  return row as RemoteModelInfo;
};

const VISION = 'gemma-4-e2b';
const VISION_UNLOADED = 'ggml-org/gemma-4-31B-it-GGUF:Q8_0';
const TEXT = 'gemma-3-4b';

/**
 * A real unloaded row — no `meta`, so the launch arguments are the only source
 * left — with its argument list swapped for the one under test.
 */
const withArgs = (args: string[]): RemoteModelInfo => {
  const row = routerRow(VISION_UNLOADED);
  return {...row, status: {...row.status, args}};
};

describe('deriveListCaps', () => {
  describe('vision, router form', () => {
    it('reads image support off the declared input modalities', () => {
      expect(
        deriveListCaps(routerRow(VISION), 'llama.cpp').supportsVision,
      ).toBe(true);
    });

    it('answers for a model the server has not loaded', () => {
      expect(
        deriveListCaps(routerRow(VISION_UNLOADED), 'llama.cpp').supportsVision,
      ).toBe(true);
    });

    it('treats a missing image modality as a definite no', () => {
      expect(deriveListCaps(routerRow(TEXT), 'llama.cpp').supportsVision).toBe(
        false,
      );
    });

    it('says nothing when the row declares no architecture at all', () => {
      // A router build predating the field, or a proxy in front of one — the
      // whole list lands here, and "cannot tell" must not read as "no".
      const row = {...routerRow(VISION)};
      delete row.architecture;

      expect('supportsVision' in deriveListCaps(row, 'llama.cpp')).toBe(false);
    });

    it('says nothing when the modalities key is not an array', () => {
      const row = {
        ...routerRow(VISION),
        architecture: {input_modalities: 'text,image' as any},
      };

      expect('supportsVision' in deriveListCaps(row, 'llama.cpp')).toBe(false);
    });
  });

  describe('vision, direct form', () => {
    const directRow = (body: typeof directVisionModelsBody): RemoteModelInfo =>
      ({
        ...body.data[0],
        capabilities: body.models[0].capabilities,
      }) as RemoteModelInfo;

    it('reads multimodal off the joined capabilities', () => {
      expect(
        deriveListCaps(directRow(directVisionModelsBody), 'llama.cpp')
          .supportsVision,
      ).toBe(true);
    });

    it('reads its absence as a definite no', () => {
      expect(
        deriveListCaps(directRow(directTextModelsBody), 'llama.cpp')
          .supportsVision,
      ).toBe(false);
    });

    it('never consults capabilities when the modalities answered', () => {
      // The router form separates image from audio and the direct form cannot,
      // so the more precise source has to win where both are present.
      const row = {...routerRow(TEXT), capabilities: ['multimodal']};

      expect(deriveListCaps(row, 'llama.cpp').supportsVision).toBe(false);
    });
  });

  describe('context length', () => {
    it('prefers what a loaded model reports over how it was launched', () => {
      const row = routerRow(VISION);
      const raised = {...row, meta: {...row.meta, n_ctx: 32768}};

      expect(deriveListCaps(raised, 'llama.cpp').contextLength).toBe(32768);
    });

    it('falls back to the launch window when nothing is loaded', () => {
      const row = routerRow(VISION_UNLOADED);

      expect(row.meta).toBeUndefined();
      expect(deriveListCaps(row, 'llama.cpp').contextLength).toBe(8192);
    });

    it.each([
      ['space form', ['--ctx-size', '4096'], 4096],
      ['inline form', ['--ctx-size=4096'], 4096],
      ['short flag', ['-c', '4096'], 4096],
      ['short inline flag', ['-c=4096'], 4096],
      ['last occurrence wins', ['--ctx-size', '2048', '-c', '4096'], 4096],
      [
        'last occurrence wins across forms',
        ['-c=2048', '--ctx-size=4096'],
        4096,
      ],
    ])('parses the %s', (_label, args, expected) => {
      expect(deriveListCaps(withArgs(args), 'llama.cpp').contextLength).toBe(
        expected,
      );
    });

    it.each([
      ['zero, which means the trained window', ['--ctx-size', '0']],
      ['a non-numeric value', ['--ctx-size', 'abc']],
      ['a negative value', ['--ctx-size', '-4096']],
      ['a trailing flag with no value', ['--jinja', '--ctx-size']],
      ['a flag that only looks similar', ['--ctx-size-foo', '4096']],
      ['no window argument at all', ['--jinja', '--flash-attn', 'auto']],
    ])('reports no window for %s', (_label, args) => {
      const caps = deriveListCaps(withArgs(args), 'llama.cpp');

      expect('contextLength' in caps).toBe(false);
    });

    it('does not let a later bad value revive an earlier good one', () => {
      const caps = deriveListCaps(
        withArgs(['--ctx-size', '4096', '--ctx-size', '0']),
        'llama.cpp',
      );

      expect('contextLength' in caps).toBe(false);
    });
  });

  describe('the serverType gate', () => {
    it.each(['Ollama', 'LM Studio', 'OpenAI', 'vLLM', undefined])(
      'reads nothing off a %s server',
      serverType => {
        // The fully-populated router row: everything to parse, nothing parsed.
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
