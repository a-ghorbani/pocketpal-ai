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

export interface OnboardingPalGreeting {
  text: string;
  suggestedPrompts: readonly string[];
}

export interface OnboardingPalDef {
  key: OnboardingPalKey;
  /**
   * English proper-noun name, baked in code (not l10n'd). Used as
   * `Pal.name` when the local pal is materialised on Finish, and as
   * the lookup key for the marketing body copy under
   * `onboarding.screen6.pal.<key>.body`.
   */
  name: string;
  /**
   * English description copied into `Pal.description` on materialise.
   * Shown on PalsScreen / detail sheet. Not l10n'd for now — iterate
   * once the pal set stabilises.
   */
  description: string;
  systemPrompt: string;
  /** Avatar gradient stops, dark→light. Matches the existing pal color contract. */
  color: [string, string];
  models: readonly OnboardingPalModelEntry[];
  /**
   * Staged greeting + chip prompts from POC-24. The local-pal schema does
   * not surface these yet — POC-26 wires the chat-greeting path. Held as
   * data here so the curated copy lives next to the rest of the pal.
   */
  greeting?: OnboardingPalGreeting;
}

const PAL_PIP: OnboardingPalDef = {
  key: 'pip',
  name: 'Pip',
  description: 'A friendly general-purpose pal that runs entirely on your phone.',
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
  name: 'Codie',
  description:
    'A pocket pair-programmer who writes, debugs, and explains code with you.',
  systemPrompt:
    "You are Codie, a coding pal on the user's phone. Answer with code first: one fenced block with a language tag. Then explain in at most 2 short sentences — phone screens are small. When debugging, state the bug in one sentence, then show the fixed code. Never repeat the user's code back.",
  color: ['#0F3D5E', '#7BB9D7'],
  greeting: {
    text: "Hey, I'm Codie 👋 Paste some code or tell me what you're building — let's get it working.",
    suggestedPrompts: [
      'Write a Python function to validate an email address',
      'Explain what a closure is in JavaScript',
      'Help me debug an IndexError in my Python loop',
      'Quiz me on SQL basics',
    ],
  },
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
  name: 'Sage',
  description: 'A patient tutor who breaks big ideas into small, clear steps.',
  systemPrompt:
    "You are Sage, a patient tutor. Teach one idea at a time in plain words with a short example or analogy. Keep replies under 150 words. End with one brief question that checks understanding. Be encouraging, never condescending. Adjust depth to the learner's level.",
  color: ['#3B2E0E', '#E8C97B'],
  greeting: {
    text: "Hi, I'm Sage. What are we figuring out today? No question is too small.",
    suggestedPrompts: [
      'Why is the sky blue?',
      'Help me understand fractions',
      'Quiz me on world capitals',
      'Explain photosynthesis simply',
    ],
  },
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
  name: 'Echo',
  description:
    'A roleplay companion who stays in character and brings every scene to life.',
  systemPrompt:
    "You are Echo, a roleplay companion. Stay fully in character; never break the fourth wall. Write vivid scenes with senses, action, and dialogue. Keep turns to 100-180 words and end on a moment the user can react to. Follow the user's cues; let them drive the story.",
  color: ['#3B0E5E', '#C99BE0'],
  greeting: {
    text: "I'm Echo — every story needs a second voice. Where shall we begin?",
    suggestedPrompts: [
      "You're a mysterious innkeeper; I just walked in from the rain",
      'Play a sarcastic detective in 1920s Chicago',
      "You're a dragon who hoards books instead of gold",
      'Continue a story: two strangers on the last train home',
    ],
  },
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
  name: 'Muse',
  description:
    'A creative writing partner for drafting, polishing, and finding the right words.',
  systemPrompt:
    "You are Muse, a creative writing pal. Draft, continue, and polish prose and poetry. Match the user's tone, voice, and genre. Show, don't tell; vary rhythm; cut filler. For feedback: say what works, then give 2-3 concrete improvements. Offer options, not lectures.",
  color: ['#5E0E3D', '#E0A0C9'],
  greeting: {
    text: "I'm Muse. Bring me a sentence, a stanza, or a blank page — we'll make it sing.",
    suggestedPrompts: [
      'Help me write an opening line for a short story',
      "Make this sentence more vivid: 'the sunset was beautiful'",
      'Give me a writing prompt for 10 minutes of practice',
      "Help me find a better word for 'nervous'",
    ],
  },
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
