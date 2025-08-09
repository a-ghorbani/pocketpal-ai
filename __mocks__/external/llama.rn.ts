class MockLlamaContext {
  id: number;
  gpu: boolean;
  reasonNoGPU: string;
  model: {isChatTemplateSupported?: boolean};

  constructor({
    contextId,
    gpu = false,
    reasonNoGPU = '',
    model = {},
  }: {
    contextId: number;
    gpu?: boolean;
    reasonNoGPU?: string;
    model?: {isChatTemplateSupported?: boolean};
  }) {
    this.id = contextId;
    this.gpu = gpu;
    this.reasonNoGPU = reasonNoGPU;
    this.model = model;
  }

  loadSession = jest.fn();
  saveSession = jest.fn();
  completion = jest.fn();
  stopCompletion = jest.fn();
  bench = jest.fn();
  // Add other methods if needed.
}

export const LlamaContext = jest
  .fn()
  .mockImplementation((params: any) => new MockLlamaContext(params));

export const loadLlamaModelInfo = jest.fn();

export default {
  LlamaContext,
  initLlama: jest.fn(),
  CompletionParams: jest.fn(),
  loadLlamaModelInfo,
};
