import {HuggingFaceModel, Model, ModelOrigin, ModelType} from '../utils/types';
import {chatTemplates} from '../utils/chat';
import {defaultCompletionParams} from '../utils/completionSettingsVersions';

// The SmolVLM repo subset hfAsModel/addHFModel read: the LLM file plus both
// mmproj siblings. Carrying this lets the download warning route through
// downloadHFModel→addHFModel, which materializes the LLM + mmproj Models into
// the store and downloads both, instead of looking up an id that was never
// reconciled in.
const LOOKIE_HF_MODEL = {
  id: 'ggml-org/SmolVLM-500M-Instruct-GGUF',
  author: 'ggml-org',
  url: 'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF',
  siblings: [
    {
      rfilename: 'SmolVLM-500M-Instruct-Q8_0.gguf',
      url: 'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/SmolVLM-500M-Instruct-Q8_0.gguf',
      size: 436806912,
    },
    {
      rfilename: 'mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
      url: 'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
      size: 108783360,
    },
    {
      rfilename: 'mmproj-SmolVLM-500M-Instruct-f16.gguf',
      url: 'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/mmproj-SmolVLM-500M-Instruct-f16.gguf',
      size: 199468800,
    },
  ],
} as unknown as HuggingFaceModel;

// Default model for the built-in Lookie pal. It is a vision model outside the
// device-rule tiers, so it ships as a self-contained offline constant rather
// than being resolved over the network at pal init.
export const LOOKIE_DEFAULT_MODEL: Model = {
  id: 'ggml-org/SmolVLM-500M-Instruct-GGUF/SmolVLM-500M-Instruct-Q8_0.gguf',
  author: 'ggml-org',
  repo: 'SmolVLM-500M-Instruct-GGUF',
  name: 'SmolVLM2-500M-Instruct (Q8_0)',
  type: 'SmolVLM',
  capabilities: ['vision'],
  visionEnabled: true,
  size: 436806912,
  params: 409252800,
  isDownloaded: false,
  downloadUrl:
    'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/SmolVLM-500M-Instruct-Q8_0.gguf',
  hfUrl: 'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF',
  progress: 0,
  filename: 'SmolVLM-500M-Instruct-Q8_0.gguf',
  isLocal: false,
  origin: ModelOrigin.HF,
  modelType: ModelType.VISION,
  defaultChatTemplate: chatTemplates.smolVLM,
  chatTemplate: chatTemplates.smolVLM,
  defaultCompletionSettings: {
    ...defaultCompletionParams,
    n_predict: 500,
    temperature: 0.7,
  },
  completionSettings: {
    ...defaultCompletionParams,
    n_predict: 500,
    temperature: 0.7,
  },
  defaultStopWords: ['<|endoftext|>', '<|im_end|>', '<end_of_utterance>'],
  stopWords: ['<|endoftext|>', '<|im_end|>', '<end_of_utterance>'],
  hfModel: LOOKIE_HF_MODEL,
  hfModelFile: {
    rfilename: 'SmolVLM-500M-Instruct-Q8_0.gguf',
    url: 'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/SmolVLM-500M-Instruct-Q8_0.gguf',
    size: 436806912,
    canFitInStorage: true,
  },
  supportsMultimodal: true,
  compatibleProjectionModels: [
    'ggml-org/SmolVLM-500M-Instruct-GGUF/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
    'ggml-org/SmolVLM-500M-Instruct-GGUF/mmproj-SmolVLM-500M-Instruct-f16.gguf',
  ],
  defaultProjectionModel:
    'ggml-org/SmolVLM-500M-Instruct-GGUF/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
};
