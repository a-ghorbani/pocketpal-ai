/**
 * Model test fixtures for E2E tests
 *
 * Defines models to test with their search queries, selectors, and download file names.
 * This allows data-driven testing across multiple models.
 */

export interface PromptTestCase {
  /** The prompt text to send */
  input: string;
  /** Optional description for test reporting */
  description?: string;
}

export interface ModelTestConfig {
  /** Unique identifier for reporting (e.g., 'smollm2-135m') */
  id: string;
  /** Search query to type in HuggingFace search */
  searchQuery: string;
  /** Text to match when selecting model from search results */
  selectorText: string;
  /** Exact filename to download (e.g., 'SmolLM2-135M-Instruct-Q4_0.gguf') */
  downloadFile: string;
  /** Prompts to test with this model */
  prompts: PromptTestCase[];
  /** Override default download timeout (ms) */
  downloadTimeout?: number;
  /** Override default inference timeout (ms) */
  inferenceTimeout?: number;
  /** Whether this is a vision/multimodal model */
  isVision?: boolean;
}

/**
 * Default timeouts for model operations
 */
export const TIMEOUTS = {
  /** Time to wait for model download (5 minutes) */
  download: 300000,
  /** Time to wait for inference response (2 minutes) */
  inference: 120000,
  /** Time to wait for app to be ready */
  appReady: 60000,
  /** Time to wait for UI elements */
  element: 10000,
} as const;

/**
 * Models configured for E2E testing
 *
 * Add new models here to include them in the test suite.
 * Each model should have small file sizes for faster CI runs.
 */
/**
 * Quick smoke test model - smallest/fastest for rapid iteration
 */
export const QUICK_TEST_MODEL: ModelTestConfig = {
  id: 'smollm2-135m',
  searchQuery: 'bartowski SmolLM2-135M-Instruct',
  selectorText: 'SmolLM2-135M-Instruct',
  downloadFile: 'SmolLM2-135M-Instruct-Q2_K.gguf',
  prompts: [{input: 'Hi', description: 'Basic greeting'}],
};

export const TEST_MODELS: ModelTestConfig[] = [
  // Quick test model first for easy filtering
  QUICK_TEST_MODEL,
  {
    id: 'lfm2.5-vl-1.6b',
    searchQuery: 'LiquidAI LFM2.5-VL-1.6B',
    selectorText: 'LFM2.5-VL-1.6B',
    downloadFile: 'LFM2.5-VL-1.6B-Q4_0.gguf',
    prompts: [{input: 'Hi', description: 'Basic greeting'}],
    downloadTimeout: 600000, // 10 min - larger model
  },
  {
    id: 'qwen3-0.6b',
    searchQuery: 'bartowski Qwen_Qwen3-0.6B',
    selectorText: 'Qwen_Qwen3-0.6B',
    downloadFile: 'Qwen_Qwen3-0.6B-Q4_0.gguf',
    prompts: [{input: 'Hi', description: 'Basic greeting'}],
  },
  {
    id: 'gemma-3n-e2b',
    searchQuery: 'bartowski google_gemma-3n-E2B-it',
    selectorText: 'google_gemma-3n-E2B-it',
    downloadFile: 'google_gemma-3n-E2B-it-Q2_K.gguf',
    prompts: [{input: 'Hi', description: 'Basic greeting'}],
    downloadTimeout: 600000,
  },
  {
    id: 'smolvlm-256m',
    searchQuery: 'ggml-org SmolVLM-256M-Instruct',
    selectorText: 'SmolVLM-256M-Instruct',
    downloadFile: 'SmolVLM-256M-Instruct-Q8_0.gguf',
    prompts: [{input: 'Hi', description: 'Basic greeting'}],
    isVision: true,
  },
];

/**
 * Models known to cause crashes or issues on specific devices
 * Used for crash reproduction testing with load-stress.spec.ts
 */
export const CRASH_REPRO_MODELS: ModelTestConfig[] = [
  {
    id: 'gemma-2-2b',
    searchQuery: 'bartowski gemma-2-2b-it',
    selectorText: 'gemma-2-2b-it',
    downloadFile: 'gemma-2-2b-it-Q6_K.gguf',
    prompts: [{input: 'Hi', description: 'Basic greeting'}],
    downloadTimeout: 600000,
  },
  {
    id: 'llama-3.2-3b',
    searchQuery: 'bartowski Llama-3.2-3B-Instruct',
    selectorText: 'Llama-3.2-3B-Instruct',
    downloadFile: 'Llama-3.2-3B-Instruct-Q6_K.gguf',
    prompts: [{input: 'Hi', description: 'Basic greeting'}],
    downloadTimeout: 600000,
  },
  {
    id: 'smolvlm-500m',
    searchQuery: 'ggml-org SmolVLM-500M-Instruct',
    selectorText: 'SmolVLM-500M-Instruct',
    downloadFile: 'SmolVLM-500M-Instruct-Q8_0.gguf',
    prompts: [{input: 'Describe this image', description: 'Vision test'}],
    isVision: true,
  },
  {
    id: 'qwen2.5-1.5b',
    searchQuery: 'bartowski Qwen2.5-1.5B-Instruct',
    selectorText: 'Qwen2.5-1.5B-Instruct',
    downloadFile: 'Qwen2.5-1.5B-Instruct-Q8_0.gguf',
    prompts: [{input: 'Hi', description: 'Basic greeting'}],
    downloadTimeout: 600000,
  },
];

/**
 * All available models (TEST_MODELS + CRASH_REPRO_MODELS)
 */
export const ALL_MODELS: ModelTestConfig[] = [...TEST_MODELS, ...CRASH_REPRO_MODELS];

/**
 * Get models to test based on environment variable filter
 *
 * Usage: TEST_MODELS=qwen3-0.6b,smolvlm-256m yarn test:ios:local
 *
 * @param includeAllModels - If true, search ALL_MODELS (including crash-repro models)
 * @returns Filtered list of models or all models if no filter set
 */
export function getModelsToTest(includeAllModels = false): ModelTestConfig[] {
  const modelFilter = process.env.TEST_MODELS;
  const modelPool = includeAllModels ? ALL_MODELS : TEST_MODELS;

  if (!modelFilter) {
    return TEST_MODELS; // Default to TEST_MODELS only
  }

  const ids = modelFilter.split(',').map(s => s.trim().toLowerCase());
  const filtered = modelPool.filter(m => ids.includes(m.id.toLowerCase()));

  if (filtered.length === 0) {
    console.warn(
      `Warning: No models matched filter "${modelFilter}". Available: ${modelPool.map(m => m.id).join(', ')}`,
    );
    return TEST_MODELS;
  }

  return filtered;
}
