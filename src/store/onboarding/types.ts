/**
 * Onboarding types — closed union of topic keys shown on the topic chip
 * grid and the in-memory state shape for the onboarding flow.
 *
 * `OnboardingState` lives inside `UIStore` (single store; per-session,
 * not persisted) — see `UIStore.onboardingState`. `hasCompletedOnboarding`
 * and `onboardingTopicsSnapshot` are persisted there too.
 *
 * The `else` chip is rendered in the 6th grid slot as a non-interactive
 * outlined card — it advertises the no-preference path without competing
 * with the real topic chips for taps. Users still reach that path via the
 * top-right Skip button. `else` is also the fallback index into
 * `TOPIC_TO_PAL` for `resolvePalForTopic(null)`.
 */

export type TopicKey =
  | 'smartchat'
  | 'coding'
  | 'education'
  | 'roleplay'
  | 'creative_writing'
  | 'else';

export const TOPIC_KEYS: readonly TopicKey[] = [
  'smartchat',
  'coding',
  'education',
  'roleplay',
  'creative_writing',
  'else',
] as const;

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface OnboardingState {
  currentStep: OnboardingStep;
  selectedTopic: TopicKey | null;
  selectedModelId: string | null;
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  currentStep: 1,
  selectedTopic: null,
  selectedModelId: null,
};
