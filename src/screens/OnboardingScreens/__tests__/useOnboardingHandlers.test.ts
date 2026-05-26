import {renderHook, act} from '@testing-library/react-hooks';

import {uiStore, palStore, modelStore} from '../../../store';
import {defaultModels} from '../../../store/defaultModels';
import {RECOMMENDED_PAL_MODEL_SET} from '../../../store/onboarding/recommendedPalModelSet';
import {ROUTES} from '../../../utils/navigationConstants';
import {useOnboardingHandlers} from '../useOnboardingHandlers';

// Navigation mock — captured per test so each assertion sees a fresh spy set.
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: mockCanGoBack,
  }),
}));

const PICKED_ID = RECOMMENDED_PAL_MODEL_SET[0];

describe('useOnboardingHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset shared store state between tests.
    uiStore.hasCompletedOnboarding = false;
    uiStore.onboardingTopicsSnapshot = [];
    uiStore.onboardingState = {
      currentStep: 1,
      selectedTopics: [],
      selectedModelId: null,
    };
    // Mock store mutators back to jest.fn() since some specs replace them.
    (uiStore.completeOnboarding as jest.Mock) = jest.fn();
    (uiStore.setOnboardingStep as jest.Mock) = jest.fn();
    // Reset palStore.pals + spies.
    palStore.pals = [];
    (palStore.updatePal as jest.Mock).mockClear();
    (modelStore.checkSpaceAndDownload as jest.Mock).mockClear();
  });

  it('marks the current step on mount via the single-writer method', () => {
    renderHook(() => useOnboardingHandlers(3));
    expect(uiStore.setOnboardingStep).toHaveBeenCalledWith(3);
  });

  describe('next', () => {
    it('navigates 1 -> Onboarding2, 5 -> Onboarding6', () => {
      const {result: r1} = renderHook(() => useOnboardingHandlers(1));
      act(() => r1.current.next());
      expect(mockNavigate).toHaveBeenLastCalledWith(ROUTES.ONBOARDING.STEP_2);

      const {result: r5} = renderHook(() => useOnboardingHandlers(5));
      act(() => r5.current.next());
      expect(mockNavigate).toHaveBeenLastCalledWith(ROUTES.ONBOARDING.STEP_6);
    });

    it('next on step 6 is a no-op (Finish path lives in `finish`)', () => {
      const {result} = renderHook(() => useOnboardingHandlers(6));
      act(() => result.current.next());
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('goBack', () => {
    it('delegates to navigation.goBack when canGoBack is true', () => {
      mockCanGoBack.mockReturnValueOnce(true);
      const {result} = renderHook(() => useOnboardingHandlers(2));
      act(() => result.current.goBack());
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when canGoBack is false (covers screen 1 / Splash guard)', () => {
      mockCanGoBack.mockReturnValueOnce(false);
      const {result} = renderHook(() => useOnboardingHandlers(1));
      act(() => result.current.goBack());
      expect(mockGoBack).not.toHaveBeenCalled();
    });
  });

  describe('skip', () => {
    it('completeOnboarding with current topics + modelId=null; no pal/model writes', () => {
      uiStore.onboardingState.selectedTopics = ['everyday'];
      uiStore.onboardingState.selectedModelId = PICKED_ID; // user picked but tapped Skip
      const {result} = renderHook(() => useOnboardingHandlers(6));
      act(() => result.current.skip());

      expect(uiStore.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topics: ['everyday'],
        modelId: null,
      });
      // Skip path does NOT bind a model or enqueue a download.
      expect(palStore.updatePal).not.toHaveBeenCalled();
      expect(modelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
    });

    it('passes a defensive copy of selectedTopics (not the live array)', () => {
      uiStore.onboardingState.selectedTopics = ['everyday'];
      const {result} = renderHook(() => useOnboardingHandlers(3));
      act(() => result.current.skip());
      const callArg = (uiStore.completeOnboarding as jest.Mock).mock.calls[0][0]
        .topics;
      // Mutating the live store after the call must not affect the
      // argument captured by completeOnboarding — slice() guard.
      uiStore.onboardingState.selectedTopics.push('coding');
      expect(callArg).toEqual(['everyday']);
    });
  });

  describe('finish', () => {
    it('binds Pip.defaultModel, completes onboarding, then enqueues download', () => {
      // Seed Pip directly so finish() can find it.
      palStore.pals = [
        {
          id: 'pip-id',
          name: 'Pip',
          source: 'local',
          type: 'local',
          description: 'desc',
          systemPrompt: 'sp',
          capabilities: {},
        } as any,
      ];
      uiStore.onboardingState.selectedModelId = PICKED_ID;
      uiStore.onboardingState.selectedTopics = ['coding'];

      const {result} = renderHook(() => useOnboardingHandlers(6));
      act(() => result.current.finish());

      // Pip is bound to the picked model via PalStore.updatePal — the
      // single writer for the Pip-defaultModel binding.
      expect(palStore.updatePal).toHaveBeenCalledTimes(1);
      const [palId, palPatch] = (palStore.updatePal as jest.Mock).mock.calls[0];
      expect(palId).toBe('pip-id');
      expect(palPatch.defaultModel?.id).toBe(PICKED_ID);

      // 2. completeOnboarding runs with the picked modelId.
      expect(uiStore.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topics: ['coding'],
        modelId: PICKED_ID,
      });

      // 3. Download is enqueued via the existing ModelStore API.
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledTimes(1);
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(PICKED_ID);

      // Ordering invariant: updatePal must precede completeOnboarding
      // (Pip-defaultModel persists before the flag flips), and
      // completeOnboarding must precede checkSpaceAndDownload (download
      // never starts on an in-flight onboarding state).
      const updateOrder = (palStore.updatePal as jest.Mock).mock
        .invocationCallOrder[0];
      const completeOrder = (uiStore.completeOnboarding as jest.Mock).mock
        .invocationCallOrder[0];
      const downloadOrder = (modelStore.checkSpaceAndDownload as jest.Mock).mock
        .invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(completeOrder);
      expect(completeOrder).toBeLessThan(downloadOrder);
    });

    it('with no Pip pal seeded, still completes onboarding and enqueues download (Pip seed runs on next launch via PalStore.initialize)', () => {
      palStore.pals = [];
      uiStore.onboardingState.selectedModelId = PICKED_ID;
      uiStore.onboardingState.selectedTopics = [];

      const {result} = renderHook(() => useOnboardingHandlers(6));
      act(() => result.current.finish());

      expect(palStore.updatePal).not.toHaveBeenCalled();
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topics: [],
        modelId: PICKED_ID,
      });
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(PICKED_ID);
    });

    it('with selectedModelId=null, falls through to completeOnboarding(modelId:null) and skips download', () => {
      palStore.pals = [{id: 'pip-id', name: 'Pip', source: 'local'} as any];
      uiStore.onboardingState.selectedModelId = null;
      uiStore.onboardingState.selectedTopics = ['everyday'];

      const {result} = renderHook(() => useOnboardingHandlers(6));
      act(() => result.current.finish());

      expect(palStore.updatePal).not.toHaveBeenCalled();
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topics: ['everyday'],
        modelId: null,
      });
      expect(modelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
    });

    it('with a selectedModelId that does NOT resolve in defaultModels, does not bind Pip and does not enqueue a download (defensive against catalogue drift)', () => {
      palStore.pals = [{id: 'pip-id', name: 'Pip', source: 'local'} as any];
      uiStore.onboardingState.selectedModelId = 'totally-unknown-id';
      uiStore.onboardingState.selectedTopics = [];

      const {result} = renderHook(() => useOnboardingHandlers(6));
      act(() => result.current.finish());

      expect(palStore.updatePal).not.toHaveBeenCalled();
      // completeOnboarding sees modelId:null when picked is undefined
      // (per `picked?.id ?? null` in finish()).
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topics: [],
        modelId: null,
      });
      expect(modelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
    });

    it('every RECOMMENDED_PAL_MODEL_SET id resolves in defaultModels (sanity guard for the finish path)', () => {
      RECOMMENDED_PAL_MODEL_SET.forEach(id => {
        expect(defaultModels.find(m => m.id === id)).toBeDefined();
      });
    });
  });
});
