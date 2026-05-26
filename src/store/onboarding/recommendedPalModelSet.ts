/**
 * Closed list of model ids offered on the onboarding recommended-pal
 * picker. Each id MUST exist in `ModelStore.defaultModels` with origin
 * PRESET. The unit test `recommendedPalModelSet.test.ts` pins this
 * contract — adding/removing entries in the catalogue without updating
 * this set, or vice versa, fails CI.
 */

export const RECOMMENDED_PAL_MODEL_SET: readonly string[] = [
  'hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF/llama-3.2-1b-instruct-q8_0.gguf',
  'Qwen/Qwen2.5-1.5B-Instruct-GGUF/qwen2.5-1.5b-instruct-q8_0.gguf',
  'bartowski/SmolLM2-1.7B-Instruct-GGUF/SmolLM2-1.7B-Instruct-Q8_0.gguf',
] as const;
