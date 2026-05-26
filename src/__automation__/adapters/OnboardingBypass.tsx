import React from 'react';

import {uiStore} from '../../store';

/**
 * E2E-only: when the build flag `__E2E_SKIP_ONBOARDING__` is true, flip
 * `hasCompletedOnboarding` to true on first mount so non-onboarding
 * specs don't have to walk the flow. Tree-shaken out of prod via the
 * same gate as the AutomationBridge.
 */
export const OnboardingBypass: React.FC = () => {
  React.useEffect(() => {
    if (__E2E__ && __E2E_SKIP_ONBOARDING__) {
      if (!uiStore.hasCompletedOnboarding) {
        uiStore.completeOnboarding({topics: [], modelId: null});
      }
    }
  }, []);
  return null;
};
