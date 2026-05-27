/**
 * Onboarding types — closed union of topic keys shown on the topic chip
 * grid (Figma `884:28282` / `890:29650`) and the in-memory state shape
 * for the onboarding flow.
 *
 * `OnboardingState` lives inside `UIStore` (single store; per-session,
 * not persisted) — see `UIStore.onboardingState`. `hasCompletedOnboarding`
 * and `onboardingTopicsSnapshot` are persisted there too.
 *
 * The 'else' chip is rendered differently (outlined, no icon) and on tap
 * writes `null` (no preference recorded) before auto-advancing to screen 6.
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
