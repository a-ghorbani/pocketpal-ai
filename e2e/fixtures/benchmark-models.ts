/**
 * Benchmark-matrix fixtures for the BenchmarkRunnerScreen.
 *
 * Lives separately from `models.ts` because the matrix has a different
 * cardinality and update rhythm: matrix entries are touched whenever the
 * device/quant landscape shifts (new model class, new device family,
 * recalibrating defaultDeviceTier whitelist), while `models.ts` holds the
 * stable fixtures the general E2E specs (quick-smoke, language, thinking,
 * load-stress) consume.
 *
 * Three tiers, in order of cadence:
 *
 *   smoke   — 3 models × 3 quants × 2 backends = 18 cells (~10–15 min).
 *             Run regularly to gate regressions.
 *   focused — 6 models × 6 quants × 2 backends ≈ 60–70 cells (~30–45 min).
 *             Run on llama.rn bumps or to investigate a smoke regression.
 *   full    — 11 models × 8 quants × 2 backends ≈ 165 cells (~3 hr/device).
 *             Run when recalibrating defaults or adding a new device class.
 *
 * Single source of truth: BENCHMARK_FULL_MODELS. The smaller tiers are
 * derived as filters by id — adding a model means editing FULL once and
 * deciding which tiers (if any) it joins.
 */

import {CacheType} from '../../src/utils/types';

import {ModelTestConfig} from './models';

/**
 * Closed enum for sweep-eligible context-init knobs. Mirrors
 * `SettingsKnob` in BenchmarkRunnerScreen.tsx — keeping the two declarations
 * aligned by hand is easier than threading a cross-package import.
 *
 * Adding a knob here is a fingerprint-version bump per WHAT 4d.1.
 */
export type BenchSettingsKnob =
  | 'cache_type_k'
  | 'cache_type_v'
  | 'flash_attn_type'
  | 'no_extra_bufts'
  | 'use_mmap'
  | 'n_threads';

/**
 * Value domain for a sweep axis after env-var validation. Each knob has a
 * different concrete domain (string enum vs boolean vs integer); see
 * `parseSettingsAxes` for per-knob validation.
 */
export type BenchSettingsValue = string | number | boolean;

export interface BenchSettingsAxis {
  name: BenchSettingsKnob;
  values: BenchSettingsValue[];
}

/**
 * Canonical quant rung labels used by the benchmark-matrix spec.
 * Lowercase; matches the spec's BENCH_QUANTS env-var filter.
 *
 * Note on iq1_s: bartowski does not publish IQ1_S for most repos; we
 * substitute with IQ2_M. The label stays canonical so cross-row
 * comparisons remain meaningful — see BENCHMARK_FULL_MODELS comments.
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
export type BenchmarkMatrixBackend = 'cpu' | 'gpu' | 'hexagon';
export type BenchmarkTier = 'smoke' | 'focused' | 'full';

/**
 * Full benchmark matrix — every model we want to track perf for, with the
 * widest quant coverage each publisher offers. Run rarely (a few times a
 * year, or when adding a device class). The smaller tiers below filter
 * from this list.
 *
 * HuggingFace coverage verified live via /api/models/<repo>/tree/main
 * before each entry was added. See PR #702 review history for details.
 */
export const BENCHMARK_FULL_MODELS: ModelTestConfig[] = [
  // --- 1B-class dense transformers ---
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
  {
    id: 'qwen2.5-1.5b',
    searchQuery: 'bartowski Qwen2.5-1.5B-Instruct',
    selectorText: 'Qwen2.5-1.5B-Instruct',
    downloadFile: 'Qwen2.5-1.5B-Instruct-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      {quant: 'iq1_s', downloadFile: 'Qwen2.5-1.5B-Instruct-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'Qwen2.5-1.5B-Instruct-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'Qwen2.5-1.5B-Instruct-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'Qwen2.5-1.5B-Instruct-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'Qwen2.5-1.5B-Instruct-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'Qwen2.5-1.5B-Instruct-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'Qwen2.5-1.5B-Instruct-Q8_0.gguf'},
    ],
  },
  {
    id: 'smollm2-1.7b',
    searchQuery: 'bartowski SmolLM2-1.7B-Instruct',
    selectorText: 'SmolLM2-1.7B-Instruct',
    downloadFile: 'SmolLM2-1.7B-Instruct-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      // No IQ2_M for this repo; lowest published is Q2_K.
      {quant: 'q2_k', downloadFile: 'SmolLM2-1.7B-Instruct-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'SmolLM2-1.7B-Instruct-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'SmolLM2-1.7B-Instruct-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'SmolLM2-1.7B-Instruct-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'SmolLM2-1.7B-Instruct-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'SmolLM2-1.7B-Instruct-Q8_0.gguf'},
    ],
  },
  // --- Latest-gen Qwen3.5 ---
  {
    id: 'qwen3.5-0.8b',
    searchQuery: 'bartowski Qwen_Qwen3.5-0.8B',
    selectorText: 'Qwen_Qwen3.5-0.8B',
    downloadFile: 'Qwen_Qwen3.5-0.8B-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      {quant: 'iq1_s', downloadFile: 'Qwen_Qwen3.5-0.8B-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'Qwen_Qwen3.5-0.8B-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'Qwen_Qwen3.5-0.8B-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'Qwen_Qwen3.5-0.8B-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'Qwen_Qwen3.5-0.8B-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'Qwen_Qwen3.5-0.8B-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'Qwen_Qwen3.5-0.8B-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'Qwen_Qwen3.5-0.8B-Q8_0.gguf'},
    ],
  },
  {
    id: 'qwen3.5-2b',
    searchQuery: 'bartowski Qwen_Qwen3.5-2B',
    selectorText: 'Qwen_Qwen3.5-2B',
    downloadFile: 'Qwen_Qwen3.5-2B-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      {quant: 'iq1_s', downloadFile: 'Qwen_Qwen3.5-2B-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'Qwen_Qwen3.5-2B-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'Qwen_Qwen3.5-2B-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'Qwen_Qwen3.5-2B-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'Qwen_Qwen3.5-2B-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'Qwen_Qwen3.5-2B-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'Qwen_Qwen3.5-2B-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'Qwen_Qwen3.5-2B-Q8_0.gguf'},
    ],
  },
  // --- Reasoning post-train ---
  {
    id: 'deepseek-r1-distill-qwen-1.5b',
    searchQuery: 'bartowski DeepSeek-R1-Distill-Qwen-1.5B',
    selectorText: 'DeepSeek-R1-Distill-Qwen-1.5B',
    downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      {quant: 'iq1_s', downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf'},
    ],
  },
  // --- Recurrent / hybrid arch ---
  {
    id: 'lfm2.5-1.2b-instruct',
    searchQuery: 'LiquidAI LFM2.5-1.2B-Instruct',
    selectorText: 'LFM2.5-1.2B-Instruct',
    downloadFile: 'LFM2.5-1.2B-Instruct-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      // Official LiquidAI publisher only ships Q4_0..Q8_0; iq/q2_k/q3_k_m
      // are unavailable. Cells for those rungs are auto-skipped by
      // BenchmarkRunnerScreen (m.quants intersection with requested rungs).
      {quant: 'q4_0', downloadFile: 'LFM2.5-1.2B-Instruct-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'LFM2.5-1.2B-Instruct-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'LFM2.5-1.2B-Instruct-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'LFM2.5-1.2B-Instruct-Q8_0.gguf'},
    ],
  },
  // --- Heavy (3.8B+ class) — ANR-prone on entry-level Adreno; keep last so
  //     partial-run data survives if the OS kills the app process.
  {
    id: 'phi-3.5-mini',
    searchQuery: 'bartowski Phi-3.5-mini-instruct',
    selectorText: 'Phi-3.5-mini-instruct',
    downloadFile: 'Phi-3.5-mini-instruct-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      {quant: 'iq1_s', downloadFile: 'Phi-3.5-mini-instruct-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'Phi-3.5-mini-instruct-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'Phi-3.5-mini-instruct-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'Phi-3.5-mini-instruct-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'Phi-3.5-mini-instruct-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'Phi-3.5-mini-instruct-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'Phi-3.5-mini-instruct-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'Phi-3.5-mini-instruct-Q8_0.gguf'},
    ],
  },
  {
    id: 'phi-4-mini',
    searchQuery: 'bartowski microsoft_Phi-4-mini-instruct',
    selectorText: 'microsoft_Phi-4-mini-instruct',
    downloadFile: 'microsoft_Phi-4-mini-instruct-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      {quant: 'iq1_s', downloadFile: 'microsoft_Phi-4-mini-instruct-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'microsoft_Phi-4-mini-instruct-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'microsoft_Phi-4-mini-instruct-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'microsoft_Phi-4-mini-instruct-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'microsoft_Phi-4-mini-instruct-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'microsoft_Phi-4-mini-instruct-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'microsoft_Phi-4-mini-instruct-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'microsoft_Phi-4-mini-instruct-Q8_0.gguf'},
    ],
  },
  {
    id: 'gemma-4-e2b',
    searchQuery: 'bartowski google_gemma-4-E2B-it',
    selectorText: 'google_gemma-4-E2B-it',
    downloadFile: 'google_gemma-4-E2B-it-Q4_0.gguf',
    downloadTimeout: 600000,
    prompts: [{input: 'Hi'}],
    quants: [
      // "E2B" naming is misleading — Q4_0 is 3.4 GB, on par with Phi-3.5-mini.
      // ANR risk on POCO-class devices for high-quant CPU benches.
      {quant: 'iq1_s', downloadFile: 'google_gemma-4-E2B-it-IQ2_M.gguf'},
      {quant: 'q2_k', downloadFile: 'google_gemma-4-E2B-it-Q2_K.gguf'},
      {quant: 'q3_k_m', downloadFile: 'google_gemma-4-E2B-it-Q3_K_M.gguf'},
      {quant: 'q4_0', downloadFile: 'google_gemma-4-E2B-it-Q4_0.gguf'},
      {quant: 'q4_k_m', downloadFile: 'google_gemma-4-E2B-it-Q4_K_M.gguf'},
      {quant: 'q5_k_m', downloadFile: 'google_gemma-4-E2B-it-Q5_K_M.gguf'},
      {quant: 'q6_k', downloadFile: 'google_gemma-4-E2B-it-Q6_K.gguf'},
      {quant: 'q8_0', downloadFile: 'google_gemma-4-E2B-it-Q8_0.gguf'},
    ],
  },
];

/** Smoke tier — fast regression gate. */
export const BENCHMARK_SMOKE_IDS = [
  'qwen3.5-0.8b',
  'qwen3-1.7b',
  'gemma-3-1b',
] as const;

/** Focused tier — investigation. Includes smoke + 3 architectural axes. */
export const BENCHMARK_FOCUSED_IDS = [
  ...BENCHMARK_SMOKE_IDS,
  'qwen3.5-2b',
  'lfm2.5-1.2b-instruct',
  'deepseek-r1-distill-qwen-1.5b',
] as const;

export const BENCHMARK_SMOKE_MODELS: ModelTestConfig[] =
  BENCHMARK_FULL_MODELS.filter(m =>
    (BENCHMARK_SMOKE_IDS as readonly string[]).includes(m.id),
  );

export const BENCHMARK_FOCUSED_MODELS: ModelTestConfig[] =
  BENCHMARK_FULL_MODELS.filter(m =>
    (BENCHMARK_FOCUSED_IDS as readonly string[]).includes(m.id),
  );

interface TierSpec {
  models: ModelTestConfig[];
  quants: readonly BenchmarkMatrixQuant[];
}

/**
 * Tier definitions. Each picks a model subset and the rung subset relevant
 * to that tier's regression-vs-investigation tradeoff.
 *
 *   smoke   — Q4_0 (native MM), Q4_K_M (dequant fallback), Q8_0 (full path).
 *             Three classes, fastest signal.
 *   focused — drops IQ1_S + Q2_K (always CPU-only; low signal/noise).
 *   full    — every rung.
 */
export const BENCHMARK_TIERS: Record<BenchmarkTier, TierSpec> = {
  smoke: {
    models: BENCHMARK_SMOKE_MODELS,
    quants: ['q4_0', 'q4_k_m', 'q8_0'],
  },
  focused: {
    models: BENCHMARK_FOCUSED_MODELS,
    quants: ['q3_k_m', 'q4_0', 'q4_k_m', 'q5_k_m', 'q6_k', 'q8_0'],
  },
  full: {
    models: BENCHMARK_FULL_MODELS,
    quants: BENCHMARK_MATRIX_QUANTS,
  },
};

/**
 * Validate and coerce a single env-var value list per knob domain.
 * Throws with a descriptive message on any invalid value — the CLI's
 * outer `main()` catches and exits non-zero (WHAT 9e: invalid env-var
 * value rejected at config-build time).
 */
function parseSettingsAxisValues(
  knob: BenchSettingsKnob,
  raw: string,
): BenchSettingsValue[] {
  const tokens = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new Error(`BENCH_${knob.toUpperCase()} produced an empty value list`);
  }
  switch (knob) {
    case 'cache_type_k':
    case 'cache_type_v': {
      const valid = new Set<string>(Object.values(CacheType));
      for (const t of tokens) {
        if (!valid.has(t)) {
          throw new Error(
            `BENCH_${knob.toUpperCase()}=${t} is not a valid CacheType (expected one of ${[
              ...valid,
            ].join(',')})`,
          );
        }
      }
      return tokens;
    }
    case 'flash_attn_type': {
      const valid = new Set(['auto', 'on', 'off']);
      for (const t of tokens) {
        if (!valid.has(t)) {
          throw new Error(
            `BENCH_FLASH_ATTN_TYPE=${t} is not valid (expected auto|on|off)`,
          );
        }
      }
      return tokens;
    }
    case 'no_extra_bufts': {
      return tokens.map(t => {
        if (t !== 'true' && t !== 'false') {
          throw new Error(
            `BENCH_NO_EXTRA_BUFTS=${t} is not valid (expected true|false)`,
          );
        }
        return t === 'true';
      });
    }
    case 'use_mmap': {
      const valid = new Set(['true', 'false', 'smart']);
      for (const t of tokens) {
        if (!valid.has(t)) {
          throw new Error(
            `BENCH_USE_MMAP=${t} is not valid (expected true|false|smart)`,
          );
        }
      }
      return tokens;
    }
    case 'n_threads': {
      return tokens.map(t => {
        const n = Number(t);
        if (!Number.isInteger(n) || n <= 0) {
          throw new Error(
            `BENCH_N_THREADS=${t} is not valid (expected a positive integer)`,
          );
        }
        return n;
      });
    }
  }
}

/**
 * Build the sweep-axes list from env vars in the fixed order WHAT 4b.3
 * mandates: cache_type_k, cache_type_v, flash_attn_type, no_extra_bufts,
 * use_mmap, n_threads. Within each axis, values keep their env-var order.
 *
 * Empty/absent env vars produce no axis; an empty result means "no
 * sweep" — downstream (`buildConfig`) emits no `settings_axes` field, so
 * the runner falls into the `app-default` path (WHAT 9a).
 */
export function parseSettingsAxes(env: NodeJS.ProcessEnv): BenchSettingsAxis[] {
  // Fixed declaration order (WHAT D5) — produces stable cell order across
  // runs.
  const order: Array<{name: BenchSettingsKnob; envKey: string}> = [
    {name: 'cache_type_k', envKey: 'BENCH_CACHE_TYPE_K'},
    {name: 'cache_type_v', envKey: 'BENCH_CACHE_TYPE_V'},
    {name: 'flash_attn_type', envKey: 'BENCH_FLASH_ATTN_TYPE'},
    {name: 'no_extra_bufts', envKey: 'BENCH_NO_EXTRA_BUFTS'},
    {name: 'use_mmap', envKey: 'BENCH_USE_MMAP'},
    {name: 'n_threads', envKey: 'BENCH_N_THREADS'},
  ];
  const axes: BenchSettingsAxis[] = [];
  for (const {name, envKey} of order) {
    const raw = env[envKey];
    if (raw && raw.trim()) {
      axes.push({name, values: parseSettingsAxisValues(name, raw)});
    }
  }
  return axes;
}

/**
 * Resolve the matrix from env vars.
 *
 *   BENCH_TIER=smoke|focused|full     default 'smoke'
 *   BENCH_MODELS=id1,id2              comma-separated model ids (further filter)
 *   BENCH_QUANTS=q4_0,q6_k            comma-separated quant rungs (further filter)
 *   BENCH_BACKENDS=cpu,gpu,hexagon    comma-separated backends (default cpu+gpu)
 *
 *   Sweep axes (any subset; absent => single-cell app-default path):
 *     BENCH_CACHE_TYPE_K=f16,q8_0
 *     BENCH_CACHE_TYPE_V=f16,q8_0
 *     BENCH_FLASH_ATTN_TYPE=auto,on,off
 *     BENCH_NO_EXTRA_BUFTS=true,false
 *     BENCH_USE_MMAP=true,false,smart
 *     BENCH_N_THREADS=4,6,8
 *
 * Filters narrow the tier — they cannot widen it. To widen, pick a higher
 * tier (e.g. BENCH_TIER=full BENCH_MODELS=phi-4-mini).
 */
export function getBenchmarkMatrix(): {
  tier: BenchmarkTier;
  models: ModelTestConfig[];
  quants: BenchmarkMatrixQuant[];
  backends: BenchmarkMatrixBackend[];
  settings_axes: BenchSettingsAxis[];
} {
  const parseCsv = (raw?: string): string[] | undefined =>
    raw
      ? raw
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean)
      : undefined;

  const rawTier = (process.env.BENCH_TIER || 'smoke').toLowerCase();
  const tier = ((['smoke', 'focused', 'full'] as const).includes(
    rawTier as BenchmarkTier,
  )
    ? rawTier
    : 'smoke') as BenchmarkTier;
  const tierSpec = BENCHMARK_TIERS[tier];

  const modelFilter = parseCsv(process.env.BENCH_MODELS);
  const quantFilter = parseCsv(process.env.BENCH_QUANTS);
  const backendFilter = parseCsv(process.env.BENCH_BACKENDS);

  const models = modelFilter
    ? tierSpec.models.filter(m => modelFilter.includes(m.id.toLowerCase()))
    : tierSpec.models;

  const quants = (
    quantFilter
      ? tierSpec.quants.filter(q => quantFilter.includes(q))
      : [...tierSpec.quants]
  ) as BenchmarkMatrixQuant[];

  // Default still cpu+gpu — Hexagon is opt-in via BENCH_BACKENDS=hexagon
  // (WHAT 4b.2). Devices without Hexagon will fail-fast per WHAT 4a.7.
  const allBackends: BenchmarkMatrixBackend[] = ['cpu', 'gpu', 'hexagon'];
  const defaultBackends: BenchmarkMatrixBackend[] = ['cpu', 'gpu'];
  const backends = backendFilter
    ? allBackends.filter(b => backendFilter.includes(b))
    : defaultBackends;

  const settings_axes = parseSettingsAxes(process.env);

  return {tier, models, quants, backends, settings_axes};
}
