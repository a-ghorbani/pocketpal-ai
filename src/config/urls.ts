import {FIREBASE_FUNCTIONS_URL} from '@env';

export const HF_DOMAIN_OFFICIAL = 'https://huggingface.co';
export const HF_DOMAIN_MIRROR = 'https://hf-mirror.com';

// HF-Mirror support: dynamically select domain based on user setting
// This is controlled by HFStore via setHFDomain()
let currentHFDomain = HF_DOMAIN_OFFICIAL;

export const setHFDomain = (useMirror: boolean) => {
  currentHFDomain = useMirror ? HF_DOMAIN_MIRROR : HF_DOMAIN_OFFICIAL;
};

export const getHFDomain = (): string => {
  return currentHFDomain;
};

// Fallback for Firebase Functions URL if not configured
const FIREBASE_BASE =
  FIREBASE_FUNCTIONS_URL || 'https://placeholder-firebase-functions.com';

export const urls = {
  // API URLs - now dynamic based on mirror setting
  modelsList: () => `${getHFDomain()}/api/models`,
  modelTree: (modelId: string) => `${getHFDomain()}/api/models/${modelId}/tree/main`,
  modelSpecs: (modelId: string) => `${getHFDomain()}/api/models/${modelId}`,

  // Web URLs - now dynamic based on mirror setting
  modelDownloadFile: (modelId: string, filename: string) =>
    `${getHFDomain()}/${modelId}/resolve/main/${filename}`,
  modelWebPage: (modelId: string) => `${getHFDomain()}/${modelId}`,

  // Benchmark Endpoint
  benchmarkSubmit: () => `${FIREBASE_BASE}/api/v1/submit`,

  // Feedback Endpoint
  feedbackSubmit: () => `${FIREBASE_BASE}/feedback`,
};
