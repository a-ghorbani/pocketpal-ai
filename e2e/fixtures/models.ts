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
  },
  {
    id: 'smolvlm-256m',
    searchQuery: 'ggml-org SmolVLM-256M-Instruct',
    selectorText: 'SmolVLM-256M-Instruct',
    downloadFile: 'SmolVLM-256M-Instruct-Q8_0.gguf',
    prompts: [{input: 'Hi', description: 'Basic greeting'}],
  },
];

/**
 * Get models to test based on environment variable filter
 *
 * Usage: TEST_MODELS=qwen3-0.6b,smolvlm-256m yarn test:ios:local
 *
 * @returns Filtered list of models or all models if no filter set
 */
export function getModelsToTest(): ModelTestConfig[] {
  const modelFilter = process.env.TEST_MODELS;

  if (!modelFilter) {
    return TEST_MODELS;
  }

  const ids = modelFilter.split(',').map(s => s.trim().toLowerCase());
  const filtered = TEST_MODELS.filter(m => ids.includes(m.id.toLowerCase()));

  if (filtered.length === 0) {
    console.warn(
      `Warning: No models matched filter "${modelFilter}". Available: ${TEST_MODELS.map(m => m.id).join(', ')}`,
    );
    return TEST_MODELS;
  }

  return filtered;
}
