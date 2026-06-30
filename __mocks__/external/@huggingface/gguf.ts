// Central jest mock for @huggingface/gguf (header range-fetch). The real module
// is ESM and performs network reads; tests drive behaviour via gguf.mockResolvedValue.
export const gguf = jest.fn(async () => ({
  metadata: {} as Record<string, unknown>,
  tensorInfos: [] as Array<{name: string}>,
}));
