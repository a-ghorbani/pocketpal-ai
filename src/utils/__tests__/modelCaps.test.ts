import {CapabilityEnv, resolveModelCaps} from '../modelCaps';
import {Model, ModelOrigin} from '../types';

const env = (overrides: Partial<CapabilityEnv> = {}): CapabilityEnv => ({
  isMultimodalActive: false,
  activeContextSettings: undefined,
  activeModelId: undefined,
  ...overrides,
});

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
