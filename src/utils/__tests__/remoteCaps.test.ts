import {
  capsMatchBinding,
  resolveRemoteCaps,
  resolveRemoteProps,
} from '../remoteCaps';
import {Model, ModelOrigin, RemoteSessionBinding} from '../types';

const URL_A = 'http://localhost:8080';
const URL_B = 'http://localhost:9090';

const binding = (
  overrides: Partial<RemoteSessionBinding> = {},
): RemoteSessionBinding => ({
  modelId: 'srv/gemma-4-e2b',
  serverId: 'srv',
  remoteModelId: 'gemma-4-e2b',
  url: URL_A,
  serverType: 'llama.cpp',
  ...overrides,
});

const remoteModel = (remoteModelId = 'gemma-4-e2b'): Model =>
  ({
    id: `srv/${remoteModelId}`,
    origin: ModelOrigin.REMOTE,
    serverId: 'srv',
    remoteModelId,
  }) as unknown as Model;

const localModel = (): Model =>
  ({id: 'local-1', origin: ModelOrigin.LOCAL}) as unknown as Model;

describe('resolveRemoteCaps', () => {
  it('returns the per-model entry when one exists', () => {
    expect(
      resolveRemoteCaps(
        remoteModel(),
        {
          'srv/gemma-4-e2b': {
            contextLength: 8192,
            supportsVision: true,
            probedUrl: URL_A,
          },
        },
        binding(),
      ),
    ).toEqual({contextLength: 8192, supportsVision: true});
  });

  it('does not let one model inherit a sibling model entry', () => {
    expect(
      resolveRemoteCaps(
        remoteModel('gemma-3-4b'),
        {'srv/gemma-4-e2b': {contextLength: 8192, supportsVision: true}},
        binding(),
      ),
    ).toEqual({});
  });

  it('resolves fields independently when the entry is partial', () => {
    expect(
      resolveRemoteCaps(
        remoteModel(),
        {'srv/gemma-4-e2b': {contextLength: 8192, probedUrl: URL_A}},
        binding(),
      ),
    ).toEqual({contextLength: 8192});
  });

  it('drops an entry probed against a different backend', () => {
    expect(
      resolveRemoteCaps(
        remoteModel(),
        {
          'srv/gemma-4-e2b': {
            contextLength: 8192,
            supportsVision: true,
            probedUrl: URL_B,
          },
        },
        binding({url: URL_A}),
      ),
    ).toEqual({});
  });

  it('keeps an entry that predates probedUrl', () => {
    expect(
      resolveRemoteCaps(
        remoteModel(),
        {'srv/gemma-4-e2b': {contextLength: 8192}},
        binding(),
      ),
    ).toEqual({contextLength: 8192});
  });

  it('keeps an entry when no session is bound to that model', () => {
    const caps = {'srv/gemma-4-e2b': {contextLength: 8192, probedUrl: URL_B}};
    expect(resolveRemoteCaps(remoteModel(), caps, undefined)).toEqual({
      contextLength: 8192,
    });
    expect(
      resolveRemoteCaps(
        remoteModel(),
        caps,
        binding({modelId: 'srv/other-model'}),
      ),
    ).toEqual({contextLength: 8192});
  });

  it('resolves nothing for a local model, an absent model, or an absent entry', () => {
    const caps = {'srv/gemma-4-e2b': {contextLength: 8192}};
    expect(resolveRemoteCaps(localModel(), caps, binding())).toEqual({});
    expect(resolveRemoteCaps(undefined, caps, binding())).toEqual({});
    expect(resolveRemoteCaps(remoteModel(), {}, binding())).toEqual({});
  });
});

describe('resolveRemoteProps', () => {
  const described = {
    samplerDefaults: {top_k: 40, temperature: 0.8},
    slotCount: 4,
    buildInfo: 'b9976-e3546c794',
    modelAlias: 'bartowski/Qwen_Qwen3-1.7B-GGUF:Q4_K_M',
    chatTemplateCaps: {supportsTools: true},
  };

  it('passes every described field through', () => {
    expect(
      resolveRemoteProps(
        remoteModel(),
        {'srv/gemma-4-e2b': {...described, probedUrl: URL_A}},
        binding(),
      ),
    ).toEqual(described);
  });

  it('resolves fields independently when the entry is partial', () => {
    expect(
      resolveRemoteProps(
        remoteModel(),
        {'srv/gemma-4-e2b': {slotCount: 4, probedUrl: URL_A}},
        binding(),
      ),
    ).toEqual({slotCount: 4});
  });

  it('drops a description of a different backend', () => {
    expect(
      resolveRemoteProps(
        remoteModel(),
        {'srv/gemma-4-e2b': {...described, probedUrl: URL_B}},
        binding({url: URL_A}),
      ),
    ).toEqual({});
  });

  it('does not let one model inherit a sibling model entry', () => {
    expect(
      resolveRemoteProps(
        remoteModel('gemma-3-4b'),
        {'srv/gemma-4-e2b': described},
        binding(),
      ),
    ).toEqual({});
  });

  it('resolves nothing for a local model, an absent model, or an absent entry', () => {
    const props = {'srv/gemma-4-e2b': described};
    expect(resolveRemoteProps(localModel(), props, binding())).toEqual({});
    expect(resolveRemoteProps(undefined, props, binding())).toEqual({});
    expect(resolveRemoteProps(remoteModel(), {}, binding())).toEqual({});
  });
});

describe('capsMatchBinding', () => {
  it('is false for an absent entry, so callers probe', () => {
    expect(capsMatchBinding(undefined, binding(), 'srv/gemma-4-e2b')).toBe(
      false,
    );
  });

  it('matches on the url the entry was probed against', () => {
    expect(
      capsMatchBinding({probedUrl: URL_A}, binding(), 'srv/gemma-4-e2b'),
    ).toBe(true);
    expect(
      capsMatchBinding({probedUrl: URL_B}, binding(), 'srv/gemma-4-e2b'),
    ).toBe(false);
  });
});
