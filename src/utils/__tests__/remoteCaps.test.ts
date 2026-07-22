import {resolveRemoteCaps} from '../remoteCaps';
import {Model, ModelOrigin, ServerConfig} from '../types';

const server = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  id: 'srv',
  name: 'llama server',
  url: 'http://localhost:8080',
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
        {'srv/gemma-4-e2b': {contextLength: 8192, supportsVision: true}},
        [server()],
      ),
    ).toEqual({contextLength: 8192, supportsVision: true});
  });

  it('does not let one model inherit a sibling model entry', () => {
    expect(
      resolveRemoteCaps(
        remoteModel('gemma-3-4b'),
        {'srv/gemma-4-e2b': {contextLength: 8192, supportsVision: true}},
        [server()],
      ),
    ).toEqual({});
  });

  it('prefers the per-model entry over the legacy per-server fields', () => {
    expect(
      resolveRemoteCaps(
        remoteModel(),
        {'srv/gemma-4-e2b': {contextLength: 8192, supportsVision: true}},
        [server({contextLength: 2048, supportsVision: false})],
      ),
    ).toEqual({contextLength: 8192, supportsVision: true});
  });

  it('falls back to legacy per-server fields when no entry exists', () => {
    expect(
      resolveRemoteCaps(remoteModel(), {}, [
        server({contextLength: 4096, supportsVision: false}),
      ]),
    ).toEqual({contextLength: 4096, supportsVision: false});
  });

  it('ignores a legacy context length of 0 left by a router probe', () => {
    expect(
      resolveRemoteCaps(remoteModel(), {}, [
        server({contextLength: 0, supportsVision: false}),
      ]),
    ).toEqual({supportsVision: false});
  });

  it('resolves fields independently when the entry is partial', () => {
    expect(
      resolveRemoteCaps(
        remoteModel(),
        {'srv/gemma-4-e2b': {contextLength: 8192}},
        [server({contextLength: 2048, supportsVision: true})],
      ),
    ).toEqual({contextLength: 8192, supportsVision: true});
  });

  it('resolves nothing for a local model, an absent model, or an unknown server', () => {
    const caps = {'srv/gemma-4-e2b': {contextLength: 8192}};
    expect(resolveRemoteCaps(localModel(), caps, [server()])).toEqual({});
    expect(resolveRemoteCaps(undefined, caps, [server()])).toEqual({});
    expect(resolveRemoteCaps(remoteModel(), {}, [])).toEqual({});
  });
});
