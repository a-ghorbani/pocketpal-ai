/**
 * Onboarding types — closed union of topic keys shown on the topic chip
 * grid and the in-memory state shape for the onboarding flow.
 *
 * `OnboardingState` lives inside `UIStore` (single store; per-session,
 * not persisted) — see `UIStore.onboardingState`. `hasCompletedOnboarding`
 * and `onboardingTopicsSnapshot` are persisted there too.
 *
 * The `else` key is retained as the fallback index into `TOPIC_TO_PAL`
 * when `resolvePalForTopic` receives `null` (user tapped Skip). It is NOT
 * rendered as a chip; the user discovers the no-preference path via the
 * top-right Skip button + the tagline under the grid.
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
