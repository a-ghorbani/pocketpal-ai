/**
 * Mock EmbeddingStore: the real one calls initLlama (native module) on
 * demand, which jest environments cannot run.
 */
export const mockEmbeddingStore = {
  context: null,
  contextPresetId: null,
  isLoading: false,
  loadError: null as string | null,
  ensureContext: jest.fn(async () => ({
    embedding: jest.fn(async () => ({embedding: []})),
  })),
  embed: jest.fn(async () => new Float32Array(4)),
  release: jest.fn(async () => undefined),
};
