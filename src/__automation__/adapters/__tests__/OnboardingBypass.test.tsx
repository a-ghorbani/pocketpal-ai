import React from 'react';

import {render} from '../../../../jest/test-utils';

import {OnboardingBypass} from '../OnboardingBypass';
import {uiStore} from '../../../store';

describe('OnboardingBypass adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uiStore.hasCompletedOnboarding = false;
    (uiStore.completeOnboarding as jest.Mock).mockClear();
  });

  afterEach(() => {
    // Restore the jest/setup.ts defaults.
    (global as any).__E2E__ = true;
    (global as any).__E2E_SKIP_ONBOARDING__ = false;
  });

  it('does nothing when __E2E_SKIP_ONBOARDING__ is false (default in dev / Jest)', () => {
    (global as any).__E2E__ = true;
    (global as any).__E2E_SKIP_ONBOARDING__ = false;
    render(<OnboardingBypass />);
    expect(uiStore.completeOnboarding).not.toHaveBeenCalled();
  });

  it('does nothing when __E2E__ is false even if SKIP flag is true (prod safety)', () => {
    (global as any).__E2E__ = false;
    (global as any).__E2E_SKIP_ONBOARDING__ = true;
    render(<OnboardingBypass />);
    expect(uiStore.completeOnboarding).not.toHaveBeenCalled();
  });

  it('flips hasCompletedOnboarding when both flags are true and the user has not completed onboarding', () => {
    (global as any).__E2E__ = true;
    (global as any).__E2E_SKIP_ONBOARDING__ = true;
    uiStore.hasCompletedOnboarding = false;

    render(<OnboardingBypass />);

    expect(uiStore.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
      topic: null,
      modelId: null,
    });
  });

  it('is a no-op when hasCompletedOnboarding is already true (idempotency on re-mount)', () => {
    (global as any).__E2E__ = true;
    (global as any).__E2E_SKIP_ONBOARDING__ = true;
    uiStore.hasCompletedOnboarding = true;

    render(<OnboardingBypass />);

    expect(uiStore.completeOnboarding).not.toHaveBeenCalled();
  });
});
