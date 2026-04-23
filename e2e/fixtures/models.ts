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

/**
 * Quant variant for the benchmark-matrix spec.
 * Extends a base ModelTestConfig with per-quant filename + size.
 */
export interface ModelQuantVariant {
  /** Lowercase canonical quant label, e.g. 'q4_0', 'iq2_m' */
  quant: string;
  /** Exact GGUF filename on HF (case-sensitive) */
  downloadFile: string;
  /** Optional: rough on-disk size in MB, for download-time pre-flight */
  size_mb?: number;
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
  /**
   * Optional quant variants used by benchmark-matrix spec only.
   * Other specs continue to use `downloadFile`.
   */
  quants?: ModelQuantVariant[];
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
    id: 'qwen3-1.7b',
    searchQuery: 'bartowski Qwen_Qwen3-1.7B',
    selectorText: 'Qwen_Qwen3-1.7B',
    downloadFile: 'Qwen_Qwen3-1.7B-Q4_K_M.gguf',
    downloadTimeout: 600000,
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

/**
 * Canonical quant rung labels used by the benchmark-matrix spec.
 * Lowercase; matches the spec's BENCH_QUANTS env-var filter.
 */
export const BENCHMARK_MATRIX_QUANTS = [
  'iq1_s',
  'q2_k',
  'q3_k_m',
  'q4_0',
  'q4_k_m',
  'q5_k_m',
  'q6_k',
  'q8_0',
] as const;

export type BenchmarkMatrixQuant = (typeof BENCHMARK_MATRIX_QUANTS)[number];
export type BenchmarkMatrixBackend = 'cpu' | 'gpu';

/**
 * Models used by benchmark-matrix spec (model × quant × backend).
 *
 * HuggingFace quant availability (verified 2026-04-21 via HEAD requests):
 *   qwen3-1.7b  (bartowski/Qwen_Qwen3-1.7B-GGUF):
 *     IQ1_S=404, Q2_K=Q3_K_M=Q4_0=Q4_K_M=Q5_K_M=Q6_K=Q8_0=200.
 *     IQ1_S substituted with IQ2_M (the lowest-bit rung actually published by
 *     bartowski for this model; lmstudio-community also does not publish IQ1_S).
 *   gemma-3-1b  (bartowski/google_gemma-3-1b-it-GGUF):
 *     same pattern; IQ1_S substituted with IQ2_M for parity.
 *   lfm2-1.2b (slot 3): DEFERRED to follow-up.
 *     bartowski/LiquidAI_LFM2-1.2B-GGUF is gated (401 for all quants) and the
 *     official LiquidAI/LFM2-1.2B-GGUF repo publishes only 5/8 quants
 *     (Q4_0..Q8_0; IQ1_S/Q2_K/Q3_K_M missing). Omit slot 3 per story Step 1
 *     ("SHIP V1 WITH 2 MODELS and document LFM2 as follow-up in the fixture file").
 *     When a complete publisher appears, push a slot 3 entry to BENCHMARK_MATRIX_MODELS.
 *
 * The matrix spec's per-row `quant` label is the canonical lowercase rung
 * (BENCHMARK_MATRIX_QUANTS entry), not the physical filename on HF — so the
 * IQ2_M substitution is transparent to consumers; they see "iq1_s" as the rung.
 */
export const BENCHMARK_MATRIX_MODELS: ModelTestConfig[] = [
  {
    id: 'qwen3-1.7b',
    searchQuery: 'bartowski Qwen_Qwen3-1.7B',
    selectorText: 'Qwen_Qwen3-1.7B',
    downloadFile: 'Qwen_Qwen3-1.7B-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      // Substituted: IQ1_S not published; using IQ2_M as the lowest-bit rung.
      {quant: 'iq1_s', downloadFile: 'Qwen_Qwen3-1.7B-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'Qwen_Qwen3-1.7B-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'Qwen_Qwen3-1.7B-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'Qwen_Qwen3-1.7B-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'Qwen_Qwen3-1.7B-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'Qwen_Qwen3-1.7B-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'Qwen_Qwen3-1.7B-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'Qwen_Qwen3-1.7B-Q8_0.gguf'},
    ],
  },
  {
    id: 'gemma-3-1b',
    searchQuery: 'bartowski google_gemma-3-1b-it',
    selectorText: 'google_gemma-3-1b-it',
    downloadFile: 'google_gemma-3-1b-it-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      // Substituted: IQ1_S not published; using IQ2_M as the lowest-bit rung.
      {quant: 'iq1_s', downloadFile: 'google_gemma-3-1b-it-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'google_gemma-3-1b-it-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'google_gemma-3-1b-it-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'google_gemma-3-1b-it-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'google_gemma-3-1b-it-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'google_gemma-3-1b-it-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'google_gemma-3-1b-it-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'google_gemma-3-1b-it-Q8_0.gguf'},
    ],
  },
  // Slot 3 (lfm2-1.2b) deferred: no publisher has all 8 quants at time of
  // v1 landing. Push a new entry here when a full set is available.
];

/**
 * Filter the benchmark matrix by env vars.
 *   BENCH_MODELS=id1,id2      comma-separated model ids (lowercase)
 *   BENCH_QUANTS=q4_0,q6_k    comma-separated quant rung labels
 *   BENCH_BACKENDS=cpu,gpu    comma-separated backend tiers
 *
 * Unrecognised values are silently dropped — empty result after filtering is
 * an explicit error at spec time.
 */
export function getBenchmarkMatrix(): {
  models: ModelTestConfig[];
  quants: BenchmarkMatrixQuant[];
  backends: BenchmarkMatrixBackend[];
} {
  const parseCsv = (raw?: string): string[] | undefined =>
    raw ? raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : undefined;

  const modelFilter = parseCsv(process.env.BENCH_MODELS);
  const quantFilter = parseCsv(process.env.BENCH_QUANTS);
  const backendFilter = parseCsv(process.env.BENCH_BACKENDS);

  const models = modelFilter
    ? BENCHMARK_MATRIX_MODELS.filter(m => modelFilter.includes(m.id.toLowerCase()))
    : BENCHMARK_MATRIX_MODELS;

  const quants = (
    quantFilter
      ? BENCHMARK_MATRIX_QUANTS.filter(q => quantFilter.includes(q))
      : [...BENCHMARK_MATRIX_QUANTS]
  ) as BenchmarkMatrixQuant[];

  const allBackends: BenchmarkMatrixBackend[] = ['cpu', 'gpu'];
  const backends = backendFilter
    ? allBackends.filter(b => backendFilter.includes(b))
    : allBackends;

  return {models, quants, backends};
}
