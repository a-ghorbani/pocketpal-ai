/**
 * Onboarding types — closed union of topic keys shown on the topic chip
 * grid (Figma `884:28282` / `890:29650`) and the in-memory state shape
 * for the onboarding flow.
 *
 * `OnboardingState` lives inside `UIStore` (single store; per-session,
 * not persisted) — see `UIStore.onboardingState`. `hasCompletedOnboarding`
 * and `onboardingTopicsSnapshot` are persisted there too.
 */

export type TopicKey =
  | 'everyday'
  | 'creative'
  | 'learning'
  | 'coding'
  | 'productivity'
  | 'roleplay';

export const TOPIC_KEYS: readonly TopicKey[] = [
  'everyday',
  'creative',
  'learning',
  'coding',
  'productivity',
  'roleplay',
] as const;

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface OnboardingState {
  currentStep: OnboardingStep;
  selectedTopics: TopicKey[];
  selectedModelId: string | null;
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  currentStep: 1,
  selectedTopics: [],
  selectedModelId: null,
};
