import {renderHook, act} from '@testing-library/react-hooks';

import {uiStore, palStore, modelStore} from '../../../store';
import {defaultModels} from '../../../store/defaultModels';
import {
  TOPIC_TO_PAL,
  entryId,
} from '../../../store/onboarding/onboardingPals';
import {ROUTES} from '../../../utils/navigationConstants';
import {useOnboardingHandlers} from '../useOnboardingHandlers';

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

const PIP_BALANCED_ID = entryId(
  TOPIC_TO_PAL.smartchat.models.find(m => m.recommended)!,
);
const CODIE_BALANCED_ID = entryId(
  TOPIC_TO_PAL.coding.models.find(m => m.recommended)!,
);

describe('useOnboardingHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uiStore.hasCompletedOnboarding = false;
    uiStore.onboardingTopicsSnapshot = [];
    uiStore.onboardingState = {
      currentStep: 1,
      selectedTopic: null,
      selectedModelId: null,
    };
    (uiStore.completeOnboarding as jest.Mock) = jest.fn();
    (uiStore.setOnboardingStep as jest.Mock) = jest.fn();
    (uiStore.setOnboardingTopic as jest.Mock) = jest.fn(key => {
      uiStore.onboardingState.selectedTopic = key;
    });
    palStore.pals = [];
    (palStore.updatePal as jest.Mock).mockClear();
    (palStore.createPal as jest.Mock).mockClear();
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

  describe('selectTopic (screen 5 — single forward control)', () => {
    it('writes the picked topic and navigates to Onboarding6 in one handler', () => {
      const {result} = renderHook(() => useOnboardingHandlers(5));
      act(() => result.current.selectTopic('smartchat'));
      expect(uiStore.setOnboardingTopic).toHaveBeenCalledWith('smartchat');
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ONBOARDING.STEP_6);
    });

    it("the 'else' escape-hatch tap writes null but still navigates", () => {
      const {result} = renderHook(() => useOnboardingHandlers(5));
      act(() => result.current.selectTopic(null));
      expect(uiStore.setOnboardingTopic).toHaveBeenCalledWith(null);
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ONBOARDING.STEP_6);
    });
  });

  describe('skip', () => {
    it('completeOnboarding with current topic + modelId=null; no pal/model writes', () => {
      uiStore.onboardingState.selectedTopic = 'smartchat';
      uiStore.onboardingState.selectedModelId = PIP_BALANCED_ID;
      const {result} = renderHook(() => useOnboardingHandlers(4));
      act(() => result.current.skip());

      expect(uiStore.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'smartchat',
        modelId: null,
      });
      expect(palStore.updatePal).not.toHaveBeenCalled();
      expect(palStore.createPal).not.toHaveBeenCalled();
      expect(modelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
    });
  });

  describe('finish', () => {
    it('topic=smartchat with existing Pip pal: rebinds defaultModel, then completes + downloads', async () => {
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
      uiStore.onboardingState.selectedModelId = PIP_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = 'smartchat';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(palStore.createPal).not.toHaveBeenCalled();
      expect(palStore.updatePal).toHaveBeenCalledTimes(1);
      const [palId, patch] = (palStore.updatePal as jest.Mock).mock.calls[0];
      expect(palId).toBe('pip-id');
      expect(patch.defaultModel?.id).toBe(PIP_BALANCED_ID);

      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'smartchat',
        modelId: PIP_BALANCED_ID,
      });
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
        PIP_BALANCED_ID,
      );
    });

    it('topic=coding with no Codie yet: materialises Codie from the pal def and binds the picked model', async () => {
      palStore.pals = [];
      uiStore.onboardingState.selectedModelId = CODIE_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = 'coding';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(palStore.createPal).toHaveBeenCalledTimes(1);
      const palData = (palStore.createPal as jest.Mock).mock.calls[0][0];
      expect(palData.name).toBe('Codie');
      expect(palData.systemPrompt).toBe(TOPIC_TO_PAL.coding.systemPrompt);
      expect(palData.defaultModel?.id).toBe(CODIE_BALANCED_ID);
      expect(palData.source).toBe('local');

      expect(palStore.updatePal).not.toHaveBeenCalled();
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'coding',
        modelId: CODIE_BALANCED_ID,
      });
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
        CODIE_BALANCED_ID,
      );
    });

    it('topic=null falls back to Pip (the else→pip mapping)', async () => {
      palStore.pals = [];
      uiStore.onboardingState.selectedModelId = PIP_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = null;

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(palStore.createPal).toHaveBeenCalledTimes(1);
      const palData = (palStore.createPal as jest.Mock).mock.calls[0][0];
      expect(palData.name).toBe('Pip');
    });

    it('with selectedModelId=null, completes onboarding without touching the pal store or download queue', async () => {
      palStore.pals = [{id: 'pip-id', name: 'Pip', source: 'local'} as any];
      uiStore.onboardingState.selectedModelId = null;
      uiStore.onboardingState.selectedTopic = 'smartchat';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(palStore.updatePal).not.toHaveBeenCalled();
      expect(palStore.createPal).not.toHaveBeenCalled();
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'smartchat',
        modelId: null,
      });
      expect(modelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
    });

    it('every preset-origin entry resolves in defaultModels (sanity guard against catalogue drift)', () => {
      for (const pal of Object.values(TOPIC_TO_PAL)) {
        for (const entry of pal.models) {
          if (entry.origin === 'preset') {
            expect(
              defaultModels.find(m => m.id === entryId(entry)),
            ).toBeDefined();
          }
        }
      }
    });
  });
});
