import {gguf} from '@huggingface/gguf';

import {isMTPCapable, isMTPCapableRemote, nEmbdOut} from '../mtp';
import {GGUFMetadata} from '../types';

const meta = (over: Partial<GGUFMetadata> = {}): GGUFMetadata => ({
  architecture: 'qwen3',
  n_layers: 28,
  n_embd: 1024,
  n_head: 16,
  n_head_kv: 8,
  n_vocab: 151936,
  n_embd_head_k: 64,
  n_embd_head_v: 64,
  ...over,
});

describe('mtp utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isMTPCapable (local-derived, KV-only)', () => {
    it('is true when nextn_predict_layers > 0', () => {
      expect(
        isMTPCapable({ggufMetadata: meta({nextn_predict_layers: 1})}),
      ).toBe(true);
    });

    it('is false when nextn_predict_layers is 0', () => {
      expect(
        isMTPCapable({ggufMetadata: meta({nextn_predict_layers: 0})}),
      ).toBe(false);
    });

    it('is false when the KV is absent (safe default / KV-only caveat)', () => {
      expect(isMTPCapable({ggufMetadata: meta()})).toBe(false);
    });

    it('is false when there is no ggufMetadata at all', () => {
      expect(isMTPCapable({})).toBe(false);
    });
  });

  describe('nEmbdOut (paired width helper)', () => {
    it('prefers embedding_length_out when present', () => {
      expect(nEmbdOut(meta({embedding_length_out: 2048}))).toBe(2048);
    });

    it('falls back to n_embd when embedding_length_out is unset', () => {
      expect(nEmbdOut(meta())).toBe(1024);
    });

    it('is undefined when no metadata is available', () => {
      expect(nEmbdOut(undefined)).toBeUndefined();
    });
  });

  describe('isMTPCapableRemote (header fetch)', () => {
    it('returns true on a positive nextn_predict_layers KV', async () => {
      (gguf as jest.Mock).mockResolvedValueOnce({
        metadata: {
          'general.architecture': 'qwen3',
          'qwen3.nextn_predict_layers': 2,
        },
        tensorInfos: [],
      });
      await expect(isMTPCapableRemote('http://x/m.gguf')).resolves.toBe(true);
    });

    it('falls back to a nextn tensor-name probe when the KV is absent', async () => {
      (gguf as jest.Mock).mockResolvedValueOnce({
        metadata: {'general.architecture': 'qwen3'},
        tensorInfos: [
          {name: 'blk.0.attn_q.weight'},
          {name: 'blk.0.nextn.embed_tokens.weight'},
        ],
      });
      await expect(isMTPCapableRemote('http://x/m.gguf')).resolves.toBe(true);
    });

    it('returns false when neither the KV nor nextn tensors are present', async () => {
      (gguf as jest.Mock).mockResolvedValueOnce({
        metadata: {'general.architecture': 'qwen3'},
        tensorInfos: [{name: 'blk.0.attn_q.weight'}],
      });
      await expect(isMTPCapableRemote('http://x/m.gguf')).resolves.toBe(false);
    });

    it('returns false (no throw) when the fetch rejects', async () => {
      (gguf as jest.Mock).mockRejectedValueOnce(new Error('network'));
      await expect(isMTPCapableRemote('http://x/m.gguf')).resolves.toBe(false);
    });
  });
});
