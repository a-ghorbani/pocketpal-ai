import {FIREBASE_FUNCTIONS_URL} from '@env';

export const HF_DOMAIN = 'https://huggingface.co';
export const HF_API_BASE = `${HF_DOMAIN}/api/models`;
export const HF_MIRROR_DOMAIN = 'https://hf-mirror.com';
export const MODELSCOPE_DOMAIN = 'https://modelscope.cn';
export const MODELSCOPE_API_BASE = `${MODELSCOPE_DOMAIN}/api/v1`;

// Fallback for Firebase Functions URL if not configured
const FIREBASE_BASE =
  FIREBASE_FUNCTIONS_URL || 'https://placeholder-firebase-functions.com';

export const urls = {
  // API URLs
  modelsList: () => `${HF_API_BASE}`,
  hfCompatibleModelsList: (domain: string) => `${domain}/api/models`,
  hfCompatibleModelTree: (domain: string, modelId: string) =>
    `${domain}/api/models/${modelId}/tree/main`,
  hfCompatibleModelSpecs: (domain: string, modelId: string) =>
    `${domain}/api/models/${modelId}`,
  modelTree: (modelId: string) => `${HF_API_BASE}/${modelId}/tree/main`,
  modelSpecs: (modelId: string) => `${HF_API_BASE}/${modelId}`,

  // Web URLs
  modelDownloadFile: (modelId: string, filename: string) =>
    `${HF_DOMAIN}/${modelId}/resolve/main/${filename}`,
  hfCompatibleModelDownloadFile: (
    domain: string,
    modelId: string,
    filename: string,
  ) => `${domain}/${modelId}/resolve/main/${filename}`,
  modelWebPage: (modelId: string) => `${HF_DOMAIN}/${modelId}`,
  hfCompatibleModelWebPage: (domain: string, modelId: string) =>
    `${domain}/${modelId}`,
  modelScopeWebPage: (modelId: string) => `${MODELSCOPE_DOMAIN}/models/${modelId}`,
  modelScopeDownloadFile: (
    modelId: string,
    filename: string,
    revision: string = 'master',
  ) => `${MODELSCOPE_DOMAIN}/models/${modelId}/resolve/${revision}/${filename}`,

  // Benchmark Endpoint
  benchmarkSubmit: () => `${FIREBASE_BASE}/api/v1/submit`,

  // Feedback Endpoint
  feedbackSubmit: () => `${FIREBASE_BASE}/feedback`,
};
