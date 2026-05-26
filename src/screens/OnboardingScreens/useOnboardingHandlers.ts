import {useCallback, useContext, useEffect} from 'react';
import {useNavigation} from '@react-navigation/native';

import {uiStore, palStore, modelStore} from '../../store';
import {L10nContext} from '../../utils';
import {ROUTES} from '../../utils/navigationConstants';
import {defaultModels} from '../../store/defaultModels';
import type {OnboardingStep} from '../../store/onboarding/types';

/**
 * Per-screen onboarding helpers: mark `currentStep` on mount, expose
 * `goNext` / `goBack` / `skip` / `finish` that route through the single-
 * writer methods on `uiStore` (and, on finish, bind the picked model to
 * the Pip pal and kick off the download via `modelStore`).
 */
export const useOnboardingHandlers = (step: OnboardingStep) => {
  const navigation = useNavigation<any>();
  const l10n = useContext(L10nContext);

  useEffect(() => {
    uiStore.setOnboardingStep(step);
  }, [step]);

  const skip = useCallback(() => {
    uiStore.completeOnboarding({
      topics: uiStore.onboardingState.selectedTopics.slice(),
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

  const finish = useCallback(() => {
    const modelId = uiStore.onboardingState.selectedModelId;
    const topics = uiStore.onboardingState.selectedTopics.slice();
    if (modelId) {
      const picked = defaultModels.find(m => m.id === modelId);
      const pip = palStore.pals.find(
        p => p.name === 'Pip' && p.source === 'local',
      );
      if (pip && picked) {
        // Bind the picked model to Pip — survives restart per the
        // idempotent-no-overwrite contract on initializePipPal.
        palStore.updatePal(pip.id, {defaultModel: picked});
      }
      uiStore.completeOnboarding({topics, modelId: picked?.id ?? null});
      if (picked) {
        // Fire-and-forget; downloads surface via the existing Models screen.
        modelStore.checkSpaceAndDownload(picked.id);
      }
    } else {
      uiStore.completeOnboarding({topics, modelId: null});
    }
  }, []);

  return {l10n, next, goBack, skip, finish};
};
