/**
 * Three quant tiers of one base model (Llama-3.2-1B-Instruct) offered on
 * the onboarding recommended-pal picker.
 *
 * Each `modelId` MUST exist in `ModelStore.defaultModels` with origin
 * PRESET. Exactly one entry has `recommended: true` (the Balanced tier);
 * the cards render in `['quick', 'balanced', 'best']` positional order.
 * The unit test `recommendedPalModelSet.test.ts` pins this contract.
 */

export type RecommendedQuantTier = 'quick' | 'balanced' | 'best';

export type RecommendedQuant = 'Q2_K' | 'Q4_K_M' | 'Q8_0';

export interface RecommendedPalModelEntry {
  tier: RecommendedQuantTier;
  modelId: string;
  quant: RecommendedQuant;
  recommended: boolean;
}

export const RECOMMENDED_PAL_MODEL_SET: readonly RecommendedPalModelEntry[] = [
  {
    tier: 'quick',
    modelId:
      'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q2_K.gguf',
    quant: 'Q2_K',
    recommended: false,
  },
  {
    tier: 'balanced',
    modelId:
      'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    quant: 'Q4_K_M',
    recommended: true,
  },
  {
    tier: 'best',
    modelId:
      'hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF/llama-3.2-1b-instruct-q8_0.gguf',
    quant: 'Q8_0',
    recommended: false,
  },
] as const;
