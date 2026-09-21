import {
  directTextModelsBody,
  directVisionModelsBody,
  routerModelsBody,
} from '../../../../jest/fixtures/remoteModelList';
import {SERVER_PROFILES} from '../index';
import type {RemoteModelInfo} from '../../../utils/types';

const readLlamaCppListRow = SERVER_PROFILES['llama.cpp'].readListRow;

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

describe('readLlamaCppListRow', () => {
  describe('vision, router form', () => {
    it('reads image support off the declared input modalities', () => {
      expect(readLlamaCppListRow(routerRow(VISION)).supportsVision).toBe(true);
    });

    it('answers for a model the server has not loaded', () => {
      expect(
        readLlamaCppListRow(routerRow(VISION_UNLOADED)).supportsVision,
      ).toBe(true);
    });

    it('treats a missing image modality as a definite no', () => {
      expect(readLlamaCppListRow(routerRow(TEXT)).supportsVision).toBe(false);
    });

    it('says nothing when the row declares no architecture at all', () => {
      // A router build predating the field, or a proxy in front of one — the
      // whole list lands here, and "cannot tell" must not read as "no".
      const row = {...routerRow(VISION)};
      delete row.architecture;

      expect('supportsVision' in readLlamaCppListRow(row)).toBe(false);
    });

    it('says nothing when the modalities key is not an array', () => {
      const row = {
        ...routerRow(VISION),
        architecture: {input_modalities: 'text,image' as any},
      };

      expect('supportsVision' in readLlamaCppListRow(row)).toBe(false);
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
        readLlamaCppListRow(directRow(directVisionModelsBody)).supportsVision,
      ).toBe(true);
    });

    it('reads its absence as a definite no', () => {
      expect(
        readLlamaCppListRow(directRow(directTextModelsBody)).supportsVision,
      ).toBe(false);
    });

    it('never consults capabilities when the modalities answered', () => {
      // The router form separates image from audio and the direct form cannot,
      // so the more precise source has to win where both are present.
      const row = {...routerRow(TEXT), capabilities: ['multimodal']};

      expect(readLlamaCppListRow(row).supportsVision).toBe(false);
    });
  });

  describe('context length', () => {
    it('prefers what a loaded model reports over how it was launched', () => {
      const row = routerRow(VISION);
      const raised = {...row, meta: {...row.meta, n_ctx: 32768}};

      expect(readLlamaCppListRow(raised).contextLength).toBe(32768);
    });

    it('falls back to the launch window when nothing is loaded', () => {
      const row = routerRow(VISION_UNLOADED);

      expect(row.meta).toBeUndefined();
      expect(readLlamaCppListRow(row).contextLength).toBe(8192);
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
      expect(readLlamaCppListRow(withArgs(args)).contextLength).toBe(expected);
    });

    it.each([
      ['zero, which means the trained window', ['--ctx-size', '0']],
      ['a non-numeric value', ['--ctx-size', 'abc']],
      ['a negative value', ['--ctx-size', '-4096']],
      ['a trailing flag with no value', ['--jinja', '--ctx-size']],
      ['a flag that only looks similar', ['--ctx-size-foo', '4096']],
      ['no window argument at all', ['--jinja', '--flash-attn', 'auto']],
      [
        'a value beyond the safe-integer range',
        ['--ctx-size', '9'.repeat(400)],
      ],
    ])('reports no window for %s', (_label, args) => {
      const caps = readLlamaCppListRow(withArgs(args));

      expect('contextLength' in caps).toBe(false);
    });

    it('reports no window when the argument list is not an array', () => {
      const row = routerRow(VISION_UNLOADED);
      const mangled = {
        ...row,
        status: {...row.status, args: '--ctx-size 8192' as any},
      };

      expect('contextLength' in readLlamaCppListRow(mangled)).toBe(false);
    });

    it('reports no window when the flag is followed by a non-string', () => {
      const caps = readLlamaCppListRow(withArgs(['--ctx-size', 4096 as any]));

      expect('contextLength' in caps).toBe(false);
    });

    it('ignores a fractional report and falls through to the launch window', () => {
      const row = routerRow(VISION);
      const fractional = {...row, meta: {...row.meta, n_ctx: 8192.5}};

      expect(readLlamaCppListRow(fractional).contextLength).toBe(8192);
    });

    it('does not let a later bad value revive an earlier good one', () => {
      const caps = readLlamaCppListRow(
        withArgs(['--ctx-size', '4096', '--ctx-size', '0']),
      );

      expect('contextLength' in caps).toBe(false);
    });
  });
});
