import {NativeLlamaContext} from '@pocketpalai/llama.rn';

import {deviceInfo} from './device-info';

import {
  GGUFSpecs,
  HuggingFaceModel,
  Model,
  ModelFile,
  ModelOrigin,
} from '../../src/utils/types';
import {CompletionParams} from '../../src/utils/completionTypes';

export const mockContextModel: NativeLlamaContext['model'] = {
  desc: '',
  size: 0,
  nEmbd: 0,
  nParams: 0,
  chatTemplates: {
    llamaChat: false,
    minja: {
      default: false,
      defaultCaps: {
        tools: false,
        toolCalls: false,
        toolResponses: false,
        systemRole: false,
        parallelToolCalls: false,
        toolCallId: false,
      },
      toolUse: false,
      toolUseCaps: {
        tools: false,
        toolCalls: false,
        toolResponses: false,
        systemRole: false,
        parallelToolCalls: false,
        toolCallId: false,
      },
    },
  },
  isChatTemplateSupported: false,
  metadata: {},
};

export const mockDefaultCompletionParams: CompletionParams = {
  // App-specific properties
  version: 3,
  include_thinking_in_context: true,

  // llama.rn API properties
  prompt: '',
  n_predict: 400,
  temperature: 0.7,
  top_k: 40,
  top_p: 0.95,
  min_p: 0.05,
  xtc_threshold: 0.1,
  xtc_probability: 0.01,
  typical_p: 1.0,
  penalty_last_n: 64,
  penalty_repeat: 1.0,
  penalty_freq: 0.5,
  penalty_present: 0.4,
  mirostat: 0,
  mirostat_tau: 5,
  mirostat_eta: 0.1,
  seed: 0,
  n_probs: 0,
  stop: ['</s>'],
};

export const mockCompletionParams: CompletionParams = {
  ...mockDefaultCompletionParams,
  n_predict: 500,
  temperature: 0.01,
  stop: ['<stop1>', '<stop2>'],
};

export const mockDefaultChatTemplate = {
  addGenerationPrompt: true,
  name: 'default chat template name',
  bosToken: '<|default_bos|>',
  eosToken: '<|default_eos|>',
  chatTemplate: 'default chat template',
  systemPrompt: 'default system prompt',
};
export const mockChatTemplate = {
  addGenerationPrompt: true,
  name: 'chat template name',
  bosToken: '<|test_bos|>',
  eosToken: '<|test_eos|>',
  chatTemplate: 'test chat template',
  systemPrompt: 'test system prompt',
};

export const mockBasicModel: Model = {
  id: 'model-1',
  name: 'Test Model 1',
  author: 'test-author',
  type: 'Test Model Type',
  size: 2 * 10 ** 9,
  params: 2 * 10 ** 9,
  isDownloaded: false,
  downloadUrl: 'https://huggingface.co/test/test-model-1',
  hfUrl: 'https://huggingface.co/test/test-model-1',
  progress: 0,
  filename: 'test-model-1.gguf',
  isLocal: false,
  origin: ModelOrigin.PRESET,
  defaultChatTemplate: mockDefaultChatTemplate,
  chatTemplate: mockChatTemplate,
  defaultCompletionSettings: mockDefaultCompletionParams,
  completionSettings: mockCompletionParams,
  defaultStopWords: mockDefaultCompletionParams.stop,
  stopWords: mockCompletionParams.stop,
};

// Factory function for creating custom models
export const createModel = (overrides = {}) => ({
  ...mockBasicModel,
  ...overrides,
});

export const basicModel = createModel({
  id: 'model-1',
  name: 'basic model',
});

export const downloadedModel = createModel({
  id: 'model-2',
  name: 'downloaded model',
  isDownloaded: true,
});

export const downloadingModel = createModel({
  id: 'model-3',
  name: 'downloading model',
  isDownloaded: false,
  progress: 45,
});

export const largeDiskModel = createModel({
  id: 'model-4',
  name: 'large model',
  isDownloaded: false,
  size: deviceInfo.freeDiskStorage * 1.1, // 10% more than free disk storage
});

export const largeMemoryModel = createModel({
  id: 'model-5',
  name: 'large model for memory',
  isDownloaded: true,
  size: deviceInfo.totalMemory * 1.1, // 10% more than total memory
});

export const localModel = createModel({
  id: 'model-6',
  name: 'local model',
  isLocal: true,
  type: 'Local',
});

export const mockHFModelFiles1: ModelFile[] = [
  {
    rfilename: 'hf-model-name-1.Q4_K_M.gguf',
    size: deviceInfo.freeDiskStorage * 0.5, // can fit in disk
    url: 'https://huggingface.co/owner/hf-model-name-1/resolve/main/hf-model-name-1.Q4_K_M.gguf',
    oid: 'sha256:abc123def456',
    canFitInStorage: true,
  },
  {
    rfilename: 'hf-model-name-1.Q5_K_M.gguf',
    size: deviceInfo.freeDiskStorage * 1.5, // can't fit in disk
    url: 'https://huggingface.co/owner/hf-model-name-1/resolve/main/hf-model-name-1.Q5_K_M.gguf',
    oid: 'sha256:xyz789uvw123',
    canFitInStorage: false,
  },
];

export const mockHFModelFiles2: ModelFile[] = [
  {
    rfilename: 'hf-model-name-2.Q4_K_M.gguf',
    size: deviceInfo.freeDiskStorage * 0.3,
    url: 'https://huggingface.co/owner/hf-model-name-2/resolve/main/hf-model-name-2.Q4_K_M.gguf',
    oid: 'sha256:def456ghi789',
    canFitInStorage: true,
  },
  {
    rfilename: 'hf-model-name-2.Q5_K_M.gguf',
    size: deviceInfo.freeDiskStorage * 0.6,
    url: 'https://huggingface.co/owner/hf-model-name-2/resolve/main/hf-model-name-2.Q5_K_M.gguf',
    oid: 'sha256:jkl012mno345',
    canFitInStorage: true,
  },
];

export const mockGGUFSpecs1: GGUFSpecs = {
  _id: 'spec-1',
  id: 'owner/hf-model-name-1',
  gguf: {
    total: 7000000000, // 7B parameters
    architecture: 'llama',
    context_length: 4096,
    quantize_imatrix_file: 'quantize.dat',
    chat_template: '<s>[INST] {{prompt}} [/INST]',
    bos_token: '<s>',
    eos_token: '</s>',
  },
};

export const mockGGUFSpecs2: GGUFSpecs = {
  ...mockGGUFSpecs1,
  _id: 'spec-2',
  id: 'owner/hf-model-name-2',
  gguf: {
    ...mockGGUFSpecs1.gguf,
    context_length: 8192,
    architecture: 'mistral',
  },
};

export const mockHFModel1: HuggingFaceModel = {
  _id: 'hf-1',
  id: 'owner/hf-model-name-1',
  author: 'owner',
  gated: false,
  inference: 'private',
  lastModified: '2024-03-20',
  likes: 1000,
  trendingScore: 0.95,
  private: false,
  sha: 'abc123',
  downloads: 50000,
  tags: ['llama', 'gguf', 'chat'],
  library_name: 'llama',
  createdAt: '2024-01-01',
  model_id: 'owner/hf-model-name-1',
  url: 'https://huggingface.co/owner/hf-model-name-1',
  siblings: mockHFModelFiles1,
  specs: mockGGUFSpecs1,
};

export const mockHFModel2: HuggingFaceModel = {
  ...mockHFModel1,
  _id: 'hf-2',
  id: 'owner/hf-model-name-2',
  model_id: 'owner/hf-model-name-2',
  downloads: 75000,
  likes: 2000,
  trendingScore: 0.98,
  tags: ['mistral', 'gguf', 'chat'],
  url: 'https://huggingface.co/owner/hf-model-name-2',
  siblings: mockHFModelFiles2,
  specs: mockGGUFSpecs2,
};

export const hfModel1 = createModel({
  id: mockHFModel1.id + '/' + mockHFModel1.siblings[0].rfilename,
  name: 'hf-model-name-1',
  author: 'owner',
  type: 'GGUF',
  isDownloaded: false,
  origin: ModelOrigin.HF,
  hfModel: mockHFModel1,
  hfModelFile: mockHFModel1.siblings[0],
});

export const hfModel2 = createModel({
  id: mockHFModel2.id + '/' + mockHFModel2.siblings[0].rfilename,
  name: 'hf-model-name-2',
  author: 'owner',
  type: 'GGUF',
  isDownloaded: false,
  origin: ModelOrigin.HF,
  hfModel: mockHFModel2,
  hfModelFile: mockHFModel2.siblings[0],
});

export const modelsList: Model[] = [
  basicModel,
  downloadedModel,
  downloadingModel,
  largeDiskModel,
  largeMemoryModel,
  localModel,
  hfModel1,
  hfModel2,
];
