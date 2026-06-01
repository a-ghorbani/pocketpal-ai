import {Appearance} from 'react-native';

import {makePersistable} from 'mobx-persist-store';
import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  l10n,
  supportedLanguages as localesSupportedLanguages,
  type AvailableLanguage,
} from '../locales';
import {ErrorState} from '../utils/errors';
import {
  INITIAL_ONBOARDING_STATE,
  type OnboardingState,
  type OnboardingStep,
  type TopicKey,
} from './onboarding/types';

export class UIStore {
  static readonly GROUP_KEYS = {
    READY_TO_USE: 'ready_to_use',
    AVAILABLE_TO_DOWNLOAD: 'available_to_download',
  } as const;

  pageStates = {
    modelsScreen: {
      filters: [] as string[],
      expandedGroups: {
        [UIStore.GROUP_KEYS.READY_TO_USE]: true,
      },
    },
  };

  // This is a flag to auto-navigate to the chat page after loading a model
  autoNavigatetoChat = true;

  //colorScheme = useColorScheme();
  colorScheme: 'light' | 'dark' =
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

  // Current selected language (default to English)
  _language: AvailableLanguage = 'en';

  // List of supported languages (derived from locales registry)
  get supportedLanguages(): readonly AvailableLanguage[] {
    return localesSupportedLanguages;
  }

  displayMemUsage = false;

  iOSBackgroundDownloading = true;

  benchmarkShareDialog = {
    shouldShow: true,
  };

  // Warning state for chat-related warnings (like multimodal warnings)
  chatWarning: ErrorState | null = null;

  // Models for which the tool-compatibility banner has already been shown.
  // Persisted so each model warns at most once per device.
  toolCompatWarnedModels: string[] = [];

  // Onboarding flow gating: persisted; default false on a fresh install.
  // Once flipped true, the OnboardingStack never re-mounts in this app
  // lifetime.
  hasCompletedOnboarding: boolean = false;

  // Frozen at onboarding completion; consumed by future Homepage
  // pal-suggestion surfaces. Never re-edited after the single write in
  // `completeOnboarding`.
  onboardingTopicsSnapshot: TopicKey[] = [];

  // Per-session, in-memory only. Reset on completion. Not persisted.
  onboardingState: OnboardingState = {...INITIAL_ONBOARDING_STATE};

  hasWarnedToolCompat(modelId: string): boolean {
    return this.toolCompatWarnedModels.includes(modelId);
  }

  markToolCompatWarned(modelId: string) {
    runInAction(() => {
      if (!this.toolCompatWarnedModels.includes(modelId)) {
        this.toolCompatWarnedModels.push(modelId);
      }
    });
  }

  showError(message: string) {
    // TODO: Implement error display logic (e.g., toast, alert, etc.)
    console.error(message);
  }

  setChatWarning(warning: ErrorState | null) {
    runInAction(() => {
      this.chatWarning = warning;
    });
  }

  clearChatWarning() {
    runInAction(() => {
      this.chatWarning = null;
    });
  }

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'UIStore',
      properties: [
        'pageStates',
        'colorScheme',
        'autoNavigatetoChat',
        'displayMemUsage',
        'benchmarkShareDialog',
        '_language',
        'toolCompatWarnedModels',
        'hasCompletedOnboarding',
        'onboardingTopicsSnapshot',
      ],
      storage: AsyncStorage,
    });

    // backwards compatibility. Removed this from the ui settings screen.
    this.iOSBackgroundDownloading = true;
  }

  setValue<T extends keyof typeof this.pageStates>(
    page: T,
    key: keyof (typeof this.pageStates)[T],
    value: any,
  ) {
    runInAction(() => {
      if (this.pageStates[page]) {
        this.pageStates[page][key] = value;
      } else {
        console.error(`Page '${page}' does not exist in pageStates`);
      }
    });
  }

  setColorScheme(colorScheme: 'light' | 'dark') {
    runInAction(() => {
      this.colorScheme = colorScheme;
    });
  }

  setLanguage(language: AvailableLanguage) {
    runInAction(() => {
      this._language = language;
    });
  }
  get language() {
    // If the language is not in l10n, return 'en'
    // This can happen when the app removes a language from l10n
    return this._language in l10n ? this._language : 'en';
  }

  get l10n() {
    return l10n[this.language];
  }

  setAutoNavigateToChat(value: boolean) {
    runInAction(() => {
      this.autoNavigatetoChat = value;
    });
  }

  setDisplayMemUsage(value: boolean) {
    runInAction(() => {
      this.displayMemUsage = value;
    });
  }

  setiOSBackgroundDownloading(value: boolean) {
    runInAction(() => {
      this.iOSBackgroundDownloading = value;
    });
  }

  setBenchmarkShareDialogPreference(shouldShow: boolean) {
    runInAction(() => {
      this.benchmarkShareDialog.shouldShow = shouldShow;
    });
  }

  setOnboardingStep(step: OnboardingStep) {
    runInAction(() => {
      this.onboardingState.currentStep = step;
    });
  }

  setOnboardingTopic(key: TopicKey | null) {
    runInAction(() => {
      this.onboardingState.selectedTopic = key;
    });
  }

  setOnboardingModelId(modelId: string | null) {
    runInAction(() => {
      this.onboardingState.selectedModelId = modelId;
    });
  }

  completeOnboarding({
    topic,
    modelId: _modelId,
  }: {
    topic: TopicKey | null;
    modelId: string | null;
  }) {
    runInAction(() => {
      this.hasCompletedOnboarding = true;
      // Persisted snapshot stays as `TopicKey[]` (FOU-117 multi-tag
      // headroom). Derive from the new scalar: null → [], else [topic].
      this.onboardingTopicsSnapshot = topic === null ? [] : [topic];
      this.onboardingState = {...INITIAL_ONBOARDING_STATE};
    });
  }

  // Test / E2E only — callers MUST gate with `__DEV__ || __E2E__`.
  resetOnboarding() {
    runInAction(() => {
      this.hasCompletedOnboarding = false;
      this.onboardingTopicsSnapshot = [];
      this.onboardingState = {...INITIAL_ONBOARDING_STATE};
    });
  }

  // User-triggered replay (About → Show intro again). Re-enters the flow
  // without nuking the persisted topic snapshot; the user's next finish
  // will overwrite it. Distinct from `resetOnboarding` (dev/E2E nuke).
  replayOnboarding() {
    runInAction(() => {
      this.hasCompletedOnboarding = false;
      this.onboardingState = {...INITIAL_ONBOARDING_STATE};
    });
  }
}

export const uiStore = new UIStore();
