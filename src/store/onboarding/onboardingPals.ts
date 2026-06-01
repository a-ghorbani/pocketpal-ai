/**
 * Hardcoded onboarding pals — one per topic chosen on screen 5, with
 * three model tiers each. `else` falls back to the Pip (smartchat) pal.
 *
 * The Balanced tier is universally `recommended: true` for now; a
 * future device-aware tier picker (pocketpal-device-rules) will adjust
 * this per phone. Until then, the same tier is pre-selected on every
 * device.
 *
 * Each `modelId` MUST exist in `ModelStore.defaultModels` with origin
 * PRESET. The accompanying unit test pins that contract.
 *
 * The pal-facing copy (display name, body text shown on screen 6) is
 * l10n-keyed at `onboarding.screen6.pal.<key>`; system prompts stay
 * here in code (technical, low-translation value, easy to iterate).
 */

import type {TopicKey} from './types';

export type OnboardingModelTier = 'quick' | 'balanced' | 'best';

export interface OnboardingPalModelEntry {
  tier: OnboardingModelTier;
  modelId: string;
  recommended: boolean;
}

export type OnboardingPalKey = 'pip' | 'codie' | 'sage' | 'echo' | 'muse';

export interface OnboardingPalDef {
  key: OnboardingPalKey;
  systemPrompt: string;
  /** Avatar gradient stops, dark→light. Matches the existing pal color contract. */
  color: [string, string];
  models: readonly OnboardingPalModelEntry[];
}

const PAL_PIP: OnboardingPalDef = {
  key: 'pip',
  systemPrompt:
    "You are Pip, a friendly and helpful assistant who runs locally on the user's phone. Keep replies concise and warm.",
  color: ['#0E0D0C', '#FAFAFA'],
  models: [
    {
      tier: 'quick',
      modelId:
        'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q2_K.gguf',
      recommended: false,
    },
    {
      tier: 'balanced',
      modelId:
        'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
      recommended: true,
    },
    {
      tier: 'best',
      modelId:
        'bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q6_K.gguf',
      recommended: false,
    },
  ],
};

const PAL_CODIE: OnboardingPalDef = {
  key: 'codie',
  systemPrompt:
    'You are Codie, a coding-focused pal. Help write, debug, and explain code. Prefer working code in fenced blocks and keep explanations short.',
  color: ['#0F3D5E', '#7BB9D7'],
  models: [
    {
      tier: 'quick',
      modelId:
        'Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/qwen2.5-coder-0.5b-instruct-q8_0.gguf',
      recommended: false,
    },
    {
      tier: 'balanced',
      modelId:
        'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/qwen2.5-coder-1.5b-instruct-q8_0.gguf',
      recommended: true,
    },
    {
      tier: 'best',
      modelId:
        'Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/qwen2.5-coder-3b-instruct-q5_k_m.gguf',
      recommended: false,
    },
  ],
};

const PAL_SAGE: OnboardingPalDef = {
  key: 'sage',
  systemPrompt:
    'You are Sage, a patient tutor. Explain step-by-step, encourage the learner, and check understanding with brief follow-up questions.',
  color: ['#3B2E0E', '#E8C97B'],
  models: [
    {
      tier: 'quick',
      modelId:
        'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
      recommended: false,
    },
    {
      tier: 'balanced',
      modelId:
        'MaziyarPanahi/Phi-3.5-mini-instruct-GGUF/Phi-3.5-mini-instruct.Q4_K_M.gguf',
      recommended: true,
    },
    {
      tier: 'best',
      modelId:
        'bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q6_K.gguf',
      recommended: false,
    },
  ],
};

const PAL_ECHO: OnboardingPalDef = {
  key: 'echo',
  systemPrompt:
    "You are Echo, a versatile roleplay companion. Stay in character, describe scenes vividly, and follow the user's narrative cues.",
  color: ['#3B0E5E', '#C99BE0'],
  models: [
    {
      tier: 'quick',
      modelId:
        'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
      recommended: false,
    },
    {
      tier: 'balanced',
      modelId:
        'TheDrummer/Gemmasutra-Mini-2B-v1-GGUF/Gemmasutra-Mini-2B-v1-Q6_K.gguf',
      recommended: true,
    },
    {
      tier: 'best',
      modelId:
        'bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q6_K.gguf',
      recommended: false,
    },
  ],
};

const PAL_MUSE: OnboardingPalDef = {
  key: 'muse',
  systemPrompt:
    "You are Muse, a creative writing pal. Offer vivid prose, varied rhythm, and constructive suggestions. Match the user's tone.",
  color: ['#5E0E3D', '#E0A0C9'],
  models: [
    {
      tier: 'quick',
      modelId:
        'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
      recommended: false,
    },
    {
      tier: 'balanced',
      modelId: 'bartowski/gemma-2-2b-it-GGUF/gemma-2-2b-it-Q6_K.gguf',
      recommended: true,
    },
    {
      tier: 'best',
      modelId:
        'bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q6_K.gguf',
      recommended: false,
    },
  ],
};

export const ONBOARDING_PALS: readonly OnboardingPalDef[] = [
  PAL_PIP,
  PAL_CODIE,
  PAL_SAGE,
  PAL_ECHO,
  PAL_MUSE,
];

export const TOPIC_TO_PAL: Record<TopicKey, OnboardingPalDef> = {
  smartchat: PAL_PIP,
  coding: PAL_CODIE,
  education: PAL_SAGE,
  roleplay: PAL_ECHO,
  creative_writing: PAL_MUSE,
  else: PAL_PIP,
};

export const resolvePalForTopic = (
  topic: TopicKey | null,
): OnboardingPalDef => TOPIC_TO_PAL[topic ?? 'else'];
