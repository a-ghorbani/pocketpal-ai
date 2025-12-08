class MockLlamaContext {
  id: number;
  contextId: number;
  gpu: boolean;
  reasonNoGPU: string;
  systemInfo: string;
  model: {isChatTemplateSupported?: boolean};

  constructor({
    contextId,
    gpu = false,
    reasonNoGPU = '',
    systemInfo = '',
    model = {},
  }: {
    contextId: number;
    gpu?: boolean;
    reasonNoGPU?: string;
    systemInfo?: string;
    model?: {isChatTemplateSupported?: boolean};
  }) {
    this.id = contextId;
    this.contextId = contextId;
    this.gpu = gpu;
    this.reasonNoGPU = reasonNoGPU;
    this.systemInfo = systemInfo;
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

export const BuildInfo = {
  number: '1.0.0',
  commit: 'a123456',
};

export default {
  LlamaContext,
  initLlama: jest.fn(),
  CompletionParams: jest.fn(),
  loadLlamaModelInfo,
};
