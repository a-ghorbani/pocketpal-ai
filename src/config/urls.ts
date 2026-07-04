import {FIREBASE_FUNCTIONS_URL} from '@env';

export const HF_DOMAIN = 'https://huggingface.co';
export const HF_MIRROR_DOMAIN = 'https://hf-mirror.com';
export const HF_API_BASE = `${HF_DOMAIN}/api/models`;

// Fallback for Firebase Functions URL if not configured
const FIREBASE_BASE =
  FIREBASE_FUNCTIONS_URL || 'https://placeholder-firebase-functions.com';

export const urls = {
  // API URLs
  modelsList: () => `${HF_API_BASE}`,
  modelTree: (modelId: string) => `${HF_API_BASE}/${modelId}/tree/main`,
  modelSpecs: (modelId: string) => `${HF_API_BASE}/${modelId}`,
  whoami: () => `${HF_DOMAIN}/api/whoami-v2`,

  // Web URLs
  modelDownloadFile: (modelId: string, filename: string, useMirror = false) =>
    `${(useMirror ? HF_MIRROR_DOMAIN : HF_DOMAIN)}/${modelId}/resolve/main/${filename}`,
  modelWebPage: (modelId: string, useMirror = false) =>
    `${(useMirror ? HF_MIRROR_DOMAIN : HF_DOMAIN)}/${modelId}`,

  // Benchmark Endpoint
  benchmarkSubmit: () => `${FIREBASE_BASE}/api/v1/submit`,

  // Feedback Endpoint
  feedbackSubmit: () => `${FIREBASE_BASE}/feedback`,
};
