/**
 * Hardcoded onboarding pals — one per topic chosen on screen 5, with
 * three model tiers each. `else` falls back to the Pip (smartchat) pal.
 *
 * The Balanced tier is universally `recommended: true` for now; a
 * future device-aware tier picker (pocketpal-device-rules) will adjust
 * this per phone. Until then, the same tier is pre-selected on every
 * device.
 *
 * Each entry is self-describing: it carries the HF repo / filename,
 * display name, size, and params used by the screen-6 picker pre-
 * registration. Entries are lazy-registered into `modelStore.models`
 * at Finish via `ModelStore.registerOnboardingPalModel`.
 *
 * Two pals MAY share an `entry.id` (e.g. Echo and Sage both reference
 * `gemma-3-1b-it-Q8_0`); `addHFModel` idempotency collapses them to a
 * single `modelStore.models` row.
 *
 * The pal-facing copy (display name, body text shown on screen 6) is
 * l10n-keyed at `onboarding.screen6.pal.<key>`; system prompts stay
 * here in code (technical, low-translation value, easy to iterate).
 */

import type {TopicKey} from './types';

export type OnboardingModelTier = 'quick' | 'balanced' | 'best';

export interface OnboardingPalModelEntry {
  tier: OnboardingModelTier;
  recommended: boolean;
  /** `author/repo-name` (HF repo identifier). */
  repo: string;
  /** GGUF filename within the repo. */
  filename: string;
  /** Derived from `repo.split('/')[0]` at module load. */
  author: string;
  /** Deterministic `huggingface.co/<repo>/resolve/main/<filename>`. */
  downloadUrl: string;
  /** Shown on the screen-6 radio subtitle. */
  displayName: string;
  /** Drives the screen-6 CTA size suffix + space-fit pre-check. */
  sizeBytes: number;
  /** Model parameter count → `Model.params`. */
  params: number;
}

/**
 * Derived entry id — matches `Model.id` shape from both `hfAsModel`
 * (`${hfModel.id}/${modelFile.rfilename}`) and `defaultModels.ts`
 * preset ids. `entry.id` is never persisted as a separate field.
 */
export const entryId = (entry: {repo: string; filename: string}): string =>
  `${entry.repo}/${entry.filename}`;

interface PalEntryInput {
  tier: OnboardingModelTier;
  recommended: boolean;
  repo: string;
  filename: string;
  params: number;
  displayName: string;
  sizeBytes: number;
}

const palEntry = (input: PalEntryInput): OnboardingPalModelEntry => ({
  tier: input.tier,
  recommended: input.recommended,
  repo: input.repo,
  filename: input.filename,
  author: input.repo.split('/')[0],
  downloadUrl: `https://huggingface.co/${input.repo}/resolve/main/${input.filename}`,
  displayName: input.displayName,
  sizeBytes: input.sizeBytes,
  params: input.params,
});

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
   * Staged greeting + chip prompts. The local-pal schema does not surface
   * these yet — the chat-greeting path is wired separately. Held as data
   * here so the curated copy lives next to the rest of the pal.
   */
  greeting?: OnboardingPalGreeting;
}

const PAL_PIP: OnboardingPalDef = {
  key: 'pip',
  name: 'Pip',
  description:
    'A friendly general-purpose pal that runs entirely on your phone.',
  systemPrompt:
    "You are Pip, a friendly and helpful assistant who runs locally on the user's phone. Keep replies concise and warm.",
  color: ['#0E0D0C', '#FAFAFA'],
  models: [
    palEntry({
      tier: 'quick',
      recommended: false,
      repo: 'LiquidAI/LFM2.5-1.2B-Instruct-GGUF',
      filename: 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
      params: 1170340608,
      displayName: 'LFM2.5 1.2B',
      sizeBytes: 730895168,
    }),
    palEntry({
      tier: 'balanced',
      recommended: true,
      repo: 'lmstudio-community/gemma-3-1b-it-GGUF',
      filename: 'gemma-3-1b-it-Q8_0.gguf',
      params: 999885952,
      displayName: 'Gemma 3 1B',
      sizeBytes: 1069306368,
    }),
    palEntry({
      tier: 'best',
      recommended: false,
      repo: 'lmstudio-community/Qwen3.5-4B-GGUF',
      filename: 'Qwen3.5-4B-Q4_K_M.gguf',
      params: 4205751296,
      displayName: 'Qwen3.5 4B',
      sizeBytes: 2707513696,
    }),
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
    palEntry({
      tier: 'quick',
      recommended: false,
      repo: 'Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF',
      filename: 'qwen2.5-coder-0.5b-instruct-q8_0.gguf',
      params: 630167424,
      displayName: 'Qwen2.5 Coder 0.5B',
      sizeBytes: 675710848,
    }),
    palEntry({
      tier: 'balanced',
      recommended: true,
      repo: 'lmstudio-community/Qwen3.5-2B-GGUF',
      filename: 'Qwen3.5-2B-Q4_K_M.gguf',
      params: 1881825088,
      displayName: 'Qwen3.5 2B',
      sizeBytes: 1270808032,
    }),
    palEntry({
      tier: 'best',
      recommended: false,
      repo: 'lmstudio-community/Qwen3.5-4B-GGUF',
      filename: 'Qwen3.5-4B-Q4_K_M.gguf',
      params: 4205751296,
      displayName: 'Qwen3.5 4B',
      sizeBytes: 2707513696,
    }),
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
    palEntry({
      tier: 'quick',
      recommended: false,
      repo: 'LiquidAI/LFM2.5-1.2B-Instruct-GGUF',
      filename: 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
      params: 1170340608,
      displayName: 'LFM2.5 1.2B',
      sizeBytes: 730895168,
    }),
    palEntry({
      tier: 'balanced',
      recommended: true,
      // Shared with Echo balanced — `addHFModel` idempotency collapses
      // duplicates into one `modelStore.models` row.
      repo: 'lmstudio-community/gemma-3-1b-it-GGUF',
      filename: 'gemma-3-1b-it-Q8_0.gguf',
      params: 999885952,
      displayName: 'Gemma 3 1B',
      sizeBytes: 1069306368,
    }),
    palEntry({
      tier: 'best',
      recommended: false,
      // Shared with Echo best.
      repo: 'lmstudio-community/gemma-3-4b-it-GGUF',
      filename: 'gemma-3-4b-it-Q4_K_M.gguf',
      params: 3880263168,
      displayName: 'Gemma 3 4B',
      sizeBytes: 2489757856,
    }),
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
    palEntry({
      tier: 'quick',
      recommended: false,
      repo: 'lmstudio-community/gemma-3-1b-it-GGUF',
      filename: 'gemma-3-1b-it-Q4_K_M.gguf',
      params: 999885952,
      displayName: 'Gemma 3 1B',
      sizeBytes: 806058240,
    }),
    palEntry({
      tier: 'balanced',
      recommended: true,
      // Shared with Sage balanced — idempotent dedupe at register time.
      repo: 'lmstudio-community/gemma-3-1b-it-GGUF',
      filename: 'gemma-3-1b-it-Q8_0.gguf',
      params: 999885952,
      displayName: 'Gemma 3 1B',
      sizeBytes: 1069306368,
    }),
    palEntry({
      tier: 'best',
      recommended: false,
      // Shared with Sage best.
      repo: 'lmstudio-community/gemma-3-4b-it-GGUF',
      filename: 'gemma-3-4b-it-Q4_K_M.gguf',
      params: 3880263168,
      displayName: 'Gemma 3 4B',
      sizeBytes: 2489757856,
    }),
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
    palEntry({
      tier: 'quick',
      recommended: false,
      // Shared with Sage quick.
      repo: 'LiquidAI/LFM2.5-1.2B-Instruct-GGUF',
      filename: 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
      params: 1170340608,
      displayName: 'LFM2.5 1.2B',
      sizeBytes: 730895168,
    }),
    palEntry({
      tier: 'balanced',
      recommended: true,
      // Shared with Codie balanced.
      repo: 'lmstudio-community/Qwen3.5-2B-GGUF',
      filename: 'Qwen3.5-2B-Q4_K_M.gguf',
      params: 1881825088,
      displayName: 'Qwen3.5 2B',
      sizeBytes: 1270808032,
    }),
    palEntry({
      tier: 'best',
      recommended: false,
      // Shared with Codie best.
      repo: 'lmstudio-community/Qwen3.5-4B-GGUF',
      filename: 'Qwen3.5-4B-Q4_K_M.gguf',
      params: 4205751296,
      displayName: 'Qwen3.5 4B',
      sizeBytes: 2707513696,
    }),
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

export const resolvePalForTopic = (topic: TopicKey | null): OnboardingPalDef =>
  TOPIC_TO_PAL[topic ?? 'else'];
