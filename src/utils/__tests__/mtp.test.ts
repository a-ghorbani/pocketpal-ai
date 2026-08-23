import {
  isMTPCapable,
  probeRemoteMTPCapability,
  nEmbdOut,
  isDraftOnlyArch,
  isDraftOnlyFilename,
  isDraftOnlyModel,
} from '../mtp';
import {GGUFMetadata} from '../types';
import {FixtureType, GGUFFixture, rangeFetchFor} from './ggufFixture';

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

// The probe caches definitive results per URL, so every test uses its own.
let urlSeq = 0;
const nextUrl = () => `http://x/m${++urlSeq}.gguf`;
let URL = '';

describe('mtp utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    URL = nextUrl();
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

  describe('probeRemoteMTPCapability (header fetch)', () => {
    const mtpFixture = () =>
      new GGUFFixture()
        .kv('general.architecture', {type: FixtureType.STRING, value: 'qwen35'})
        .kv('qwen35.nextn_predict_layers', {
          type: FixtureType.UINT32,
          value: 2,
        });

    const serveFixture = (fixture: GGUFFixture) => {
      const impl = rangeFetchFor(fixture.build());
      (globalThis.fetch as jest.Mock).mockImplementation(impl);
      return impl;
    };

    const nativeFetch = globalThis.fetch;
    beforeEach(() => {
      globalThis.fetch = jest.fn() as unknown as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = nativeFetch;
    });

    it('is capable on a positive nextn_predict_layers KV', async () => {
      serveFixture(mtpFixture());
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('capable');
    });

    it('falls back to a nextn tensor-name probe when the KV is absent', async () => {
      serveFixture(
        new GGUFFixture()
          .kv('general.architecture', {
            type: FixtureType.STRING,
            value: 'qwen35',
          })
          .tensor('blk.0.attn_q.weight')
          .tensor('blk.0.nextn.embed_tokens.weight'),
      );
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('capable');
    });

    it('is not-capable when neither the KV nor nextn tensors are present', async () => {
      serveFixture(
        new GGUFFixture()
          .kv('general.architecture', {
            type: FixtureType.STRING,
            value: 'qwen35',
          })
          .tensor('blk.0.attn_q.weight'),
      );
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('not-capable');
    });

    it('is unknown, not not-capable, when the fetch rejects', async () => {
      (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('network'));
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('unknown');
    });

    it('is unknown on a payload that is not GGUF at all', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation(
        rangeFetchFor(new TextEncoder().encode('<html>rate limited</html>')),
      );
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('unknown');
    });

    it('parses a given header once and serves repeat probes from cache', async () => {
      const impl = serveFixture(mtpFixture());
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('capable');
      const callsAfterFirst = impl.mock.calls.length;
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('capable');
      expect(impl.mock.calls.length).toBe(callsAfterFirst);
    });

    it('does not cache unknown, so a failed probe can retry', async () => {
      (globalThis.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('network'),
      );
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('unknown');
      serveFixture(mtpFixture());
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('capable');
    });
  });
});

describe('draft-only detection', () => {
  const dmeta = (architecture: string, nextn?: number) =>
    ({architecture, nextn_predict_layers: nextn}) as any;

  it('treats an assistant-arch file as draft-only', () => {
    expect(isDraftOnlyArch('gemma4-assistant')).toBe(true);
    expect(isDraftOnlyModel({ggufMetadata: dmeta('gemma4-assistant', 4)})).toBe(
      true,
    );
  });

  it('does NOT treat an embedded-MTP model as draft-only', () => {
    // Qwen3.5-0.8B-MTP: nextn > 0 but a normal arch, and it loads and
    // generates on device - gating it would break a shipped mode.
    expect(isDraftOnlyArch('qwen35')).toBe(false);
    expect(isDraftOnlyModel({ggufMetadata: dmeta('qwen35', 1)})).toBe(false);
    expect(isMTPCapable({ggufMetadata: dmeta('qwen35', 1)})).toBe(true);
  });

  it('leaves a plain target alone', () => {
    expect(isDraftOnlyArch('gemma4')).toBe(false);
    expect(isDraftOnlyModel({ggufMetadata: dmeta('gemma4')})).toBe(false);
  });

  it('falls back to the filename before the header is available', () => {
    expect(isDraftOnlyFilename('mtp-gemma-4-E2B-it-Q8_0.gguf')).toBe(true);
    expect(isDraftOnlyFilename('gemma-4-E2B-it-Q4_0.gguf')).toBe(false);
    expect(isDraftOnlyFilename('Qwen3.5-0.8B-Q4_0.gguf')).toBe(false);
    expect(isDraftOnlyModel({filename: 'mtp-gemma-4-E2B-it-Q8_0.gguf'})).toBe(
      true,
    );
  });

  it('accepts the separator and suffix spellings converters actually ship', () => {
    // Seen in the wild: ggml-org uses `-assistant`, AtomicChat `_assistant`,
    // Radamanthys11 the older `_mtp`.
    expect(isDraftOnlyArch('gemma4-assistant')).toBe(true);
    expect(isDraftOnlyArch('gemma4_assistant')).toBe(true);
    expect(isDraftOnlyArch('gemma4_mtp')).toBe(true);
    // A target whose name merely contains the word must not match.
    expect(isDraftOnlyArch('assistant-gemma4')).toBe(false);
  });

  it('requires a delimited assistant token in the filename', () => {
    // "assistant" as a substring of a longer word is a chat model, not a
    // draft (openassistant-*, and every mmproj/target that mentions it).
    expect(
      isDraftOnlyFilename('openassistant-llama2-13b-orca-8k-3319.Q4_K_M.gguf'),
    ).toBe(false);
    expect(isDraftOnlyFilename('gemma4-assistant-Q8_0.gguf')).toBe(true);
    expect(isDraftOnlyFilename('gemma4_assistant.Q8_0.gguf')).toBe(true);
  });

  it('lets a valid chat architecture override a draft-looking filename', () => {
    // The header is authoritative: once metadata exists, a name that merely
    // contains a draft token must not disable Load or strip vision.
    expect(
      isDraftOnlyModel({
        ggufMetadata: dmeta('llama'),
        filename: 'openassistant-llama2-13b-orca-8k-3319.Q4_K_M.gguf',
      }),
    ).toBe(false);
    expect(
      isDraftOnlyModel({
        ggufMetadata: dmeta('gemma4'),
        filename: 'mtp-gemma-4-E2B-it-Q8_0.gguf',
      }),
    ).toBe(false);
  });

  it('classifies by header when present, by filename only when absent', () => {
    expect(
      isDraftOnlyModel({
        ggufMetadata: dmeta('gemma4-assistant', 4),
        filename: 'oddly-named.gguf',
      }),
    ).toBe(true);
    expect(
      isDraftOnlyModel({
        ggufMetadata: dmeta('qwen35', 1),
        filename: 'Qwen3.5-0.8B-Q4_0.gguf',
      }),
    ).toBe(false);
    // No metadata yet (pre-download): naming convention decides.
    expect(isDraftOnlyModel({filename: 'gemma4-assistant-Q8_0.gguf'})).toBe(
      true,
    );
  });
});
