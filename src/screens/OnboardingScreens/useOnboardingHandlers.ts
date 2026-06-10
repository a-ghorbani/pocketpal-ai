import {useCallback, useContext, useEffect} from 'react';
import {useNavigation} from '@react-navigation/native';

import {uiStore, palStore, modelStore} from '../../store';
import {L10nContext} from '../../utils';
import {ROUTES} from '../../utils/navigationConstants';
import {defaultModels} from '../../store/defaultModels';
import {resolvePalForTopic} from '../../store/onboarding/onboardingPals';
import type {Pal} from '../../types/pal';
import type {OnboardingStep, TopicKey} from '../../store/onboarding/types';

/**
 * Per-screen onboarding helpers: mark `currentStep` on mount, expose
 * `goNext` / `goBack` / `skip` / `finish` / `selectTopic` that route through
 * the single-writer methods on `uiStore` (and, on finish, materialise the
 * topic-matched local pal, bind the picked model, and kick off the download
 * via `modelStore`).
 */
export const useOnboardingHandlers = (step: OnboardingStep) => {
  const navigation = useNavigation<any>();
  const l10n = useContext(L10nContext);

  useEffect(() => {
    uiStore.setOnboardingStep(step);
  }, [step]);

  const skip = useCallback(() => {
    uiStore.completeOnboarding({
      topic: uiStore.onboardingState.selectedTopic,
      modelId: null,
    });
  }, []);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const goTo = useCallback(
    (name: string) => {
      navigation.navigate(name);
    },
    [navigation],
  );

  const next = useCallback(() => {
    const map: Record<OnboardingStep, string | null> = {
      1: ROUTES.ONBOARDING.STEP_2,
      2: ROUTES.ONBOARDING.STEP_3,
      3: ROUTES.ONBOARDING.STEP_4,
      4: ROUTES.ONBOARDING.STEP_5,
      5: ROUTES.ONBOARDING.STEP_6,
      6: null,
    };
    const target = map[step];
    if (target) {
      goTo(target);
    }
  }, [step, goTo]);

  // Screen-5 chip tap: write topic + navigate in the same handler
  // (single forward control — there is no Continue button on screen 5).
  const selectTopic = useCallback(
    (key: TopicKey | null) => {
      uiStore.setOnboardingTopic(key);
      goTo(ROUTES.ONBOARDING.STEP_6);
    },
    [goTo],
  );

  const finish = useCallback(async () => {
    const modelId = uiStore.onboardingState.selectedModelId;
    const topic = uiStore.onboardingState.selectedTopic;
    if (!modelId) {
      uiStore.completeOnboarding({topic, modelId: null});
      return;
    }
    const picked = defaultModels.find(m => m.id === modelId);
    const palDef = resolvePalForTopic(topic);
    const existing = palStore.pals.find(
      p => p.name === palDef.name && p.source === 'local',
    );
    if (existing) {
      // Pip is auto-created at boot (back-compat); other topic pals
      // may already exist if the user replays onboarding. In both
      // cases, just rebind the picked model.
      if (picked) {
        await palStore.updatePal(existing.id, {defaultModel: picked});
      }
    } else {
      // First time finishing with this topic — materialise the pal.
      const palData: Omit<Pal, 'id' | 'created_at' | 'updated_at'> = {
        type: 'local',
        name: palDef.name,
        description: palDef.description,
        systemPrompt: palDef.systemPrompt,
        isSystemPromptChanged: false,
        useAIPrompt: false,
        defaultModel: picked,
        parameters: {},
        parameterSchema: [],
        capabilities: {},
        color: palDef.color,
        source: 'local',
      };
      await palStore.createPal(palData);
    }
    uiStore.completeOnboarding({topic, modelId: picked?.id ?? null});
    if (picked) {
      // Fire-and-forget. checkSpaceAndDownload rethrows (its caller is
      // meant to handle failures via the snackbar); we catch here because
      // the surface displays errors through `modelStore.downloadError`
      // already and we'd otherwise leak an unhandled rejection on cancel.
      modelStore.checkSpaceAndDownload(picked.id).catch(() => {
        // intentionally swallowed — downloadError surfaces the failure.
      });
    }
  }, []);

  return {l10n, next, goBack, skip, finish, selectTopic};
};
