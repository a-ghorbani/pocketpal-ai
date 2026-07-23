import {CapabilityEnv, resolveModelCaps} from '../modelCaps';
import {Model, ModelOrigin} from '../types';
import type {ListDerivedCaps} from '../listCaps';

const env = (overrides: Partial<CapabilityEnv> = {}): CapabilityEnv => ({
  remoteCaps: {},
  listCaps: {},
  binding: undefined,
  isMultimodalActive: false,
  activeContextSettings: undefined,
  activeModelId: undefined,
  ...overrides,
});

const remoteModel = (): Model =>
  ({
    id: 'srv/gemma-4-e2b',
    origin: ModelOrigin.REMOTE,
    serverId: 'srv',
    remoteModelId: 'gemma-4-e2b',
  }) as unknown as Model;

const localModel = (overrides: Partial<Model> = {}): Model =>
  ({
    id: 'local-1',
    origin: ModelOrigin.LOCAL,
    ...overrides,
  }) as unknown as Model;

describe('resolveModelCaps', () => {
  it('reports unknown for no model', () => {
    expect(resolveModelCaps(undefined, env())).toEqual({
      vision: 'unknown',
      visionActive: false,
    });
  });

  describe('remote', () => {
    it.each([
      [true, 'yes', true],
      [false, 'no', false],
      [undefined, 'unknown', false],
    ])(
      'maps supportsVision %p to %s',
      (supportsVision, vision, visionActive) => {
        const caps = resolveModelCaps(
          remoteModel(),
          env({
            remoteCaps: {'srv/gemma-4-e2b': {supportsVision}},
            activeModelId: 'srv/gemma-4-e2b',
          }),
        );
        expect(caps.vision).toBe(vision);
        expect(caps.visionActive).toBe(visionActive);
      },
    );

    it('populates both length fields from the probed window', () => {
      const caps = resolveModelCaps(
        remoteModel(),
        env({
          remoteCaps: {'srv/gemma-4-e2b': {contextLength: 8192}},
          activeModelId: 'srv/gemma-4-e2b',
        }),
      );
      expect(caps.contextLength).toBe(8192);
      expect(caps.effectiveContextLength).toBe(8192);
    });

    it('treats a zero window as absent', () => {
      const caps = resolveModelCaps(
        remoteModel(),
        env({
          remoteCaps: {'srv/gemma-4-e2b': {contextLength: 0}},
          activeModelId: 'srv/gemma-4-e2b',
        }),
      );
      expect(caps.contextLength).toBeUndefined();
      expect(caps.effectiveContextLength).toBeUndefined();
    });

    it('keeps the session axis empty for a model that is not active', () => {
      const caps = resolveModelCaps(
        remoteModel(),
        env({
          remoteCaps: {
            'srv/gemma-4-e2b': {supportsVision: true, contextLength: 8192},
          },
          activeModelId: 'srv/other-model',
        }),
      );
      expect(caps.vision).toBe('yes');
      expect(caps.contextLength).toBe(8192);
      expect(caps.visionActive).toBe(false);
      expect(caps.effectiveContextLength).toBeUndefined();
    });

    it('resolves to unknown when the caps describe another backend', () => {
      const caps = resolveModelCaps(
        remoteModel(),
        env({
          remoteCaps: {
            'srv/gemma-4-e2b': {
              supportsVision: true,
              contextLength: 8192,
              probedUrl: 'http://localhost:8080',
            },
          },
          binding: {
            modelId: 'srv/gemma-4-e2b',
            serverId: 'srv',
            remoteModelId: 'gemma-4-e2b',
            url: 'http://localhost:9090',
            serverType: 'llama.cpp',
          },
        }),
      );
      expect(caps.vision).toBe('unknown');
      expect(caps.contextLength).toBeUndefined();
    });

    describe('the list tier', () => {
      const listed = (caps: Partial<ListDerivedCaps>) => ({
        'srv/gemma-4-e2b': {tier: 'list' as const, ...caps},
      });

      it('answers the declared axis when nothing has been probed', () => {
        const caps = resolveModelCaps(
          remoteModel(),
          env({listCaps: listed({supportsVision: true, contextLength: 8192})}),
        );
        expect(caps.vision).toBe('yes');
        expect(caps.contextLength).toBe(8192);
      });

      it('loses to the probe field by field', () => {
        const caps = resolveModelCaps(
          remoteModel(),
          env({
            remoteCaps: {
              'srv/gemma-4-e2b': {supportsVision: false, contextLength: 4096},
            },
            listCaps: listed({supportsVision: true, contextLength: 8192}),
          }),
        );
        expect(caps.vision).toBe('no');
        expect(caps.contextLength).toBe(4096);
      });

      it('still answers the field the probe left empty', () => {
        const caps = resolveModelCaps(
          remoteModel(),
          env({
            remoteCaps: {'srv/gemma-4-e2b': {supportsVision: true}},
            listCaps: listed({contextLength: 8192}),
          }),
        );
        expect(caps.vision).toBe('yes');
        expect(caps.contextLength).toBe(8192);
      });

      it('survives a probe entry carrying a legacy zero window', () => {
        const caps = resolveModelCaps(
          remoteModel(),
          env({
            remoteCaps: {'srv/gemma-4-e2b': {contextLength: 0}},
            listCaps: listed({contextLength: 8192}),
          }),
        );
        expect(caps.contextLength).toBe(8192);
      });

      it('never reaches the session axis, even for the active model', () => {
        // The card describes the configured server; attach, the send gate and
        // the context banner describe the bound session, which is only ever
        // answered by a probe. So the active model can read Vision: Supported
        // with attach still disabled — whenever the list has an answer and the
        // probe has no entry, because it timed out, answered non-2xx, or was
        // dropped with the models list by a url edit and only the list came
        // back. Activating *attempts* confirmation; it does not guarantee it.
        // Fail-closed, and self-correcting on the next successful probe.
        const caps = resolveModelCaps(
          remoteModel(),
          env({
            listCaps: listed({supportsVision: true, contextLength: 8192}),
            activeModelId: 'srv/gemma-4-e2b',
          }),
        );
        expect(caps.vision).toBe('yes');
        expect(caps.visionActive).toBe(false);
        expect(caps.effectiveContextLength).toBeUndefined();
      });

      it('answers the declared axis when a probe entry describes another backend', () => {
        // Defensive only: a url edit drops the probe entry and the list
        // together, and the write guard refuses a probe whose url has moved,
        // so nothing normally leaves a mismatched entry behind.
        const caps = resolveModelCaps(
          remoteModel(),
          env({
            remoteCaps: {
              'srv/gemma-4-e2b': {
                supportsVision: false,
                probedUrl: 'http://localhost:8080',
              },
            },
            binding: {
              modelId: 'srv/gemma-4-e2b',
              serverId: 'srv',
              remoteModelId: 'gemma-4-e2b',
              url: 'http://localhost:9090',
              serverType: 'llama.cpp',
            },
            listCaps: listed({supportsVision: true}),
            activeModelId: 'srv/gemma-4-e2b',
          }),
        );
        expect(caps.vision).toBe('yes');
        expect(caps.visionActive).toBe(false);
      });
    });

    it('ignores local session state', () => {
      const caps = resolveModelCaps(
        remoteModel(),
        env({
          isMultimodalActive: true,
          activeModelId: 'srv/gemma-4-e2b',
          activeContextSettings: {n_ctx: 4096} as any,
        }),
      );
      expect(caps.visionActive).toBe(false);
      expect(caps.effectiveContextLength).toBeUndefined();
    });
  });

  describe('local', () => {
    it.each([
      [true, 'yes'],
      [false, 'no'],
      [undefined, 'unknown'],
    ])('maps supportsMultimodal %p to %s', (supportsMultimodal, vision) => {
      expect(
        resolveModelCaps(localModel({supportsMultimodal}), env()).vision,
      ).toBe(vision);
    });

    it('prefers the hf window over gguf metadata', () => {
      const caps = resolveModelCaps(
        localModel({
          hfModel: {specs: {gguf: {context_length: 32768}}},
          ggufMetadata: {context_length: 8192},
        } as unknown as Partial<Model>),
        env(),
      );
      expect(caps.contextLength).toBe(32768);
    });

    it('falls through to gguf metadata when the hf window is zero', () => {
      const caps = resolveModelCaps(
        localModel({
          hfModel: {specs: {gguf: {context_length: 0}}},
          ggufMetadata: {context_length: 8192},
        } as unknown as Partial<Model>),
        env(),
      );
      expect(caps.contextLength).toBe(8192);
    });

    it('reports an absent window rather than zero', () => {
      const caps = resolveModelCaps(
        localModel({
          ggufMetadata: {context_length: 0},
        } as unknown as Partial<Model>),
        env(),
      );
      expect(caps.contextLength).toBeUndefined();
    });

    it('reports the live session state for the active model', () => {
      const caps = resolveModelCaps(
        localModel({supportsMultimodal: true}),
        env({
          activeModelId: 'local-1',
          isMultimodalActive: true,
          activeContextSettings: {n_ctx: 4096} as any,
        }),
      );
      expect(caps.visionActive).toBe(true);
      expect(caps.effectiveContextLength).toBe(4096);
    });

    it('never borrows the active model session state for another model', () => {
      const caps = resolveModelCaps(
        localModel({id: 'local-2', supportsMultimodal: true}),
        env({
          activeModelId: 'local-1',
          isMultimodalActive: true,
          activeContextSettings: {n_ctx: 4096} as any,
        }),
      );
      expect(caps.vision).toBe('yes');
      expect(caps.visionActive).toBe(false);
      expect(caps.effectiveContextLength).toBeUndefined();
    });

    it('separates the declared window from the one the session measures against', () => {
      const caps = resolveModelCaps(
        localModel({
          ggufMetadata: {context_length: 32768},
        } as unknown as Partial<Model>),
        env({
          activeModelId: 'local-1',
          activeContextSettings: {n_ctx: 4096} as any,
        }),
      );
      expect(caps.contextLength).toBe(32768);
      expect(caps.effectiveContextLength).toBe(4096);
    });

    it('treats a zero session window as absent', () => {
      const caps = resolveModelCaps(
        localModel(),
        env({
          activeModelId: 'local-1',
          activeContextSettings: {n_ctx: 0} as any,
        }),
      );
      expect(caps.effectiveContextLength).toBeUndefined();
    });
  });
});
