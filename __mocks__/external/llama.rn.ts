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
  getFormattedChat = jest.fn().mockResolvedValue({
    type: 'jinja',
    prompt: '<|im_start|>user\ntest<|im_end|>\n<|im_start|>assistant\n',
    has_media: false,
  });
  initMultimodal = jest.fn().mockResolvedValue(true);
  isMultimodalEnabled = jest.fn().mockResolvedValue(false);
  // Add other methods if needed.
}

export const LlamaContext = jest
  .fn()
  .mockImplementation((params: any) => new MockLlamaContext(params));

export const loadLlamaModelInfo = jest.fn();

export const initLlama = jest.fn();

export const toggleNativeLog = jest.fn().mockResolvedValue(undefined);

export const addNativeLogListener = jest.fn().mockReturnValue({
  remove: jest.fn(),
});

export const BuildInfo = {
  number: '1.0.0',
  commit: 'a123456',
};

export default {
  LlamaContext,
  initLlama,
  toggleNativeLog,
  addNativeLogListener,
  CompletionParams: jest.fn(),
  loadLlamaModelInfo,
};
