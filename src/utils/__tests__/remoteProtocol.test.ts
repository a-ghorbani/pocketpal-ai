import {
  isRemoteApiMode,
  isRemoteWireApi,
  normalizePositiveInteger,
  REMOTE_WIRE_APIS,
  resolveResponsesSamplingCapabilities,
  resolveRemoteProtocol,
} from '../remoteProtocol';
import {normalizeRemoteCatalogModel} from '../remoteCatalog';

describe('remote protocol contracts', () => {
  it('accepts only supported wire APIs and modes', () => {
    expect(REMOTE_WIRE_APIS).toEqual(['chat-completions', 'responses']);
    expect(isRemoteWireApi('chat-completions')).toBe(true);
    expect(isRemoteWireApi('responses')).toBe(true);
    expect(isRemoteWireApi('/responses')).toBe(false);
    expect(isRemoteWireApi('messages')).toBe(false);
    expect(isRemoteApiMode('auto')).toBe(true);
    expect(isRemoteApiMode(undefined)).toBe(false);
  });

  describe('resolveResponsesSamplingCapabilities', () => {
    it('uses exact provider/model/protocol evidence without hostname matching', () => {
      expect(
        resolveResponsesSamplingCapabilities({
          serverType: 'GitHub Copilot',
          modelId: 'gpt-5.6-terra',
          wireApi: 'responses',
        }).temperature,
      ).toEqual({
        supported: false,
        source: 'provider-verification',
        reasoningModes: ['absent'],
      });

      expect(
        resolveResponsesSamplingCapabilities({
          serverType: 'GitHub Copilot',
          modelId: 'prefix-gpt-5.6-terra',
          wireApi: 'responses',
        }).temperature,
      ).toBeUndefined();
    });

    it('prefers explicit catalog evidence and leaves unknown fields unknown', () => {
      const result = resolveResponsesSamplingCapabilities({
        serverType: 'GitHub Copilot',
        modelId: 'gpt-5.6-terra',
        wireApi: 'responses',
        catalogCapabilities: {
          responsesSampling: {
            temperature: {supported: true, source: 'live-catalog'},
          },
        },
      });

      expect(result.temperature).toEqual({
        supported: true,
        source: 'live-catalog',
      });
      expect(result.topP).toBeUndefined();
    });
  });

  it('normalizes only safe positive integer limits', () => {
    expect(normalizePositiveInteger(128000)).toBe(128000);
    expect(normalizePositiveInteger(0)).toBeUndefined();
    expect(normalizePositiveInteger(-1)).toBeUndefined();
    expect(normalizePositiveInteger(1.5)).toBeUndefined();
    expect(normalizePositiveInteger('128000')).toBeUndefined();
  });
});

describe('resolveRemoteProtocol', () => {
  const catalog = (
    supported_endpoints: unknown,
    provenance: 'live' | 'cached' = 'live',
  ) => normalizeRemoteCatalogModel({supported_endpoints}, provenance);

  it.each([
    ['Chat only', ['/chat/completions'], 'chat-completions', true],
    ['Responses only', ['/responses'], 'responses', true],
    [
      'both, with Responses listed first',
      ['/responses', '/chat/completions'],
      'chat-completions',
      true,
    ],
    ['unsupported only', ['/v1/messages'], undefined, false],
    [
      'unknown mixed with recognized',
      ['/v1/messages', '/responses'],
      'responses',
      true,
    ],
  ] as const)(
    'resolves %s catalog metadata',
    (_label, endpoints, wireApi, supported) => {
      expect(resolveRemoteProtocol({catalog: catalog(endpoints)})).toEqual({
        ...(wireApi ? {wireApi} : {}),
        source: 'catalog',
        supported,
      });
    },
  );

  it.each([
    ['missing', undefined],
    ['empty', []],
    ['not an array', '/responses'],
    ['containing a malformed entry', ['/responses', 1]],
  ])(
    'compatibility-defaults Chat for %s endpoint metadata',
    (_label, value) => {
      expect(resolveRemoteProtocol({catalog: catalog(value)})).toEqual({
        wireApi: 'chat-completions',
        source: 'compatibility-default',
        supported: true,
        warning: 'unknown-support',
      });
    },
  );

  it('treats legacy undefined apiMode as Auto', () => {
    expect(
      resolveRemoteProtocol({
        apiMode: undefined,
        catalog: catalog(['/responses']),
      }),
    ).toMatchObject({wireApi: 'responses', source: 'catalog'});
  });

  it('gives a model override precedence over a server override', () => {
    expect(
      resolveRemoteProtocol({
        modelPreference: {wireApi: 'responses'},
        apiMode: 'chat-completions',
        catalog: catalog(['/responses']),
      }),
    ).toEqual({
      wireApi: 'responses',
      source: 'model-override',
      supported: true,
    });
  });

  it('uses an explicit server override ahead of Auto', () => {
    expect(
      resolveRemoteProtocol({
        apiMode: 'responses',
        catalog: catalog(['/responses']),
      }),
    ).toEqual({
      wireApi: 'responses',
      source: 'server-override',
      supported: true,
    });
  });

  it.each([
    ['model', {modelPreference: {wireApi: 'responses' as const}}],
    ['server', {apiMode: 'responses' as const}],
  ])(
    'keeps a contradicting %s override selected and warns',
    (_label, options) => {
      expect(
        resolveRemoteProtocol({
          ...options,
          catalog: catalog(['/chat/completions']),
        }),
      ).toMatchObject({
        wireApi: 'responses',
        supported: true,
        warning: 'contradicts-catalog',
      });
    },
  );

  it('does not call unknown catalog support a contradiction', () => {
    expect(
      resolveRemoteProtocol({
        apiMode: 'responses',
        catalog: catalog(undefined),
      }),
    ).toEqual({
      wireApi: 'responses',
      source: 'server-override',
      supported: true,
    });
  });

  it.each([
    ['live', 'catalog'],
    ['cached', 'cached-catalog'],
  ] as const)('preserves %s catalog provenance', (provenance, source) => {
    expect(
      resolveRemoteProtocol({
        catalog: catalog(['/responses'], provenance),
      }).source,
    ).toBe(source);
  });
});
