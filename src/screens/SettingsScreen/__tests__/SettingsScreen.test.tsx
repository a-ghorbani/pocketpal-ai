import React from 'react';
import {Platform, Keyboard} from 'react-native';
import {runInAction} from 'mobx';

import {
  fireEvent,
  render as baseRender,
  waitFor,
  act,
} from '../../../../jest/test-utils';

import {SettingsScreen} from '../SettingsScreen';

import {modelStore, uiStore, ttsStore} from '../../../store';
import {l10n} from '../../../locales';

jest.useFakeTimers();

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Keyboard, 'dismiss');
    // Ensure clean timer state for each test
    jest.clearAllTimers();
  });

  afterEach(() => {
    // Clean up any remaining timers
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders settings screen correctly', async () => {
    const {getByText, getByDisplayValue} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });

    expect(getByText('Model Initialization Settings')).toBeTruthy();
    expect(getByText('Model Loading Settings')).toBeTruthy();
    expect(getByText('App Settings')).toBeTruthy();
    expect(getByDisplayValue('2048')).toBeTruthy(); // Context size
  });

  it('updates context size correctly', async () => {
    jest.useFakeTimers();
    const {getByDisplayValue} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    const contextSizeInput = getByDisplayValue('2048');

    act(() => {
      fireEvent.changeText(contextSizeInput, '512');
    });
    act(() => {
      fireEvent(contextSizeInput, 'blur');
    });

    // Advance timers within act to handle React state updates
    act(() => {
      jest.advanceTimersByTime(501); // Wait for debounce
    });

    await waitFor(() => {
      expect(modelStore.setNContext).toHaveBeenCalledWith(512);
    });
  });

  it('displays error for invalid context size input', async () => {
    const {getByDisplayValue, getByText} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    const contextSizeInput = getByDisplayValue('2048');

    await act(async () => {
      fireEvent.changeText(contextSizeInput, '100'); // Below minimum size
    });

    expect(getByText('Please enter a valid number (minimum 200)')).toBeTruthy();
  });

  it('handles outside press correctly and resets input', async () => {
    const {getByDisplayValue, getByText} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    const contextSizeInput = getByDisplayValue('2048');

    fireEvent.changeText(contextSizeInput, '512');
    fireEvent.press(getByText('Model Initialization Settings'));

    await waitFor(() => {
      expect(Keyboard.dismiss).toHaveBeenCalled();
      expect(getByDisplayValue('2048')).toBeTruthy(); // Reset back to original size
    });
  });

  it('re-syncs the displayed context size when n_ctx changes externally', async () => {
    const {getByDisplayValue, rerender} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    expect(getByDisplayValue('2048')).toBeTruthy();

    const original = modelStore.contextInitParams.n_ctx;
    // Simulate the chat banner's increase-context flow raising the global n_ctx.
    runInAction(() => {
      modelStore.contextInitParams.n_ctx = 8192;
    });
    rerender(<SettingsScreen />);

    await waitFor(() => {
      expect(getByDisplayValue('8192')).toBeTruthy();
    });

    runInAction(() => {
      modelStore.contextInitParams.n_ctx = original;
    });
  });

  it('toggles Auto Offload/Load switch', async () => {
    const {getByTestId} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    const autoOffloadSwitch = getByTestId('auto-offload-load-switch');

    await act(async () => {
      fireEvent(autoOffloadSwitch, 'valueChange', false);
    });

    expect(modelStore.updateUseAutoRelease).toHaveBeenCalledWith(false);
  });

  it('toggles Auto-Navigate to Chat switch', async () => {
    const {getByTestId} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    const autoNavigateSwitch = getByTestId('auto-navigate-to-chat-switch');

    await act(async () => {
      fireEvent(autoNavigateSwitch, 'valueChange', false);
    });

    expect(uiStore.setAutoNavigateToChat).toHaveBeenCalledWith(false);
  });

  it('toggles Dark Mode switch', async () => {
    const {getByTestId} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    const darkModeSwitch = getByTestId('dark-mode-switch');

    await act(async () => {
      fireEvent(darkModeSwitch, 'valueChange', true);
    });

    expect(uiStore.setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('toggles GPU acceleration switch on iOS and adjusts GPU layers', async () => {
    Platform.OS = 'ios';
    jest.useFakeTimers();

    const {getByTestId} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    await waitFor(() => {
      expect(getByTestId('device-option-gpu')).toBeTruthy();
    });
    const gpuBtn = getByTestId('device-option-gpu');

    act(() => {
      fireEvent(gpuBtn, 'press');
    });

    expect(modelStore.setDevices).toHaveBeenCalledWith(['Metal']);

    const gpuSlider = getByTestId('gpu-layers-slider');

    act(() => {
      fireEvent(gpuSlider, 'valueChange', 60);
    });

    // Fast-forward time by 300ms to trigger debounced callback within act
    act(() => {
      jest.advanceTimersByTime(300); // Wait for debounce
    });

    expect(modelStore.setNGPULayers).toHaveBeenCalledWith(60);
  });

  it('toggles Display Memory Usage switch', async () => {
    const {getByTestId} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });
    const memoryUsageSwitch = getByTestId('display-memory-usage-switch');

    await act(async () => {
      fireEvent(memoryUsageSwitch, 'valueChange', true);
    });

    expect(uiStore.setDisplayMemUsage).toHaveBeenCalledWith(true);
  });

  it('renders image max tokens slider in advanced settings', async () => {
    jest.useFakeTimers();
    const {getByTestId, getByText} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });

    // Expand advanced settings
    const advancedSettingsButton = getByText('Advanced Settings');
    fireEvent.press(advancedSettingsButton);

    await waitFor(() => {
      expect(getByTestId('image-max-tokens-slider')).toBeTruthy();
    });
  });

  it('updates image max tokens correctly', async () => {
    jest.useFakeTimers();
    const {getByTestId, getByText} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });

    // Expand advanced settings
    fireEvent.press(getByText('Advanced Settings'));

    await waitFor(() => {
      expect(getByTestId('image-max-tokens-slider')).toBeTruthy();
    });

    const slider = getByTestId('image-max-tokens-slider');

    act(() => {
      fireEvent(slider, 'onValueChange', 768);
    });

    // Fast-forward time by 300ms to trigger debounced callback within act
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(modelStore.setImageMaxTokens).toHaveBeenCalledWith(768);
  });

  it('toggles the speculative decoding switch in advanced settings', async () => {
    jest.useFakeTimers();
    const {getByTestId, getByText} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });

    // Expand advanced settings to reveal the speculative section.
    fireEvent.press(getByText('Advanced Settings'));

    await waitFor(() => {
      expect(getByTestId('speculative-decoding-switch')).toBeTruthy();
    });

    act(() => {
      fireEvent(
        getByTestId('speculative-decoding-switch'),
        'valueChange',
        true,
      );
    });

    expect(modelStore.setSpeculativeEnabled).toHaveBeenCalledWith(true);
  });

  it('gates the draft cache menus behind the speculative toggle', async () => {
    jest.useFakeTimers();
    runInAction(() => {
      modelStore.contextInitParams.speculativeEnabled = false;
    });
    const {getByTestId, getByText, queryByText} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });

    fireEvent.press(getByText('Advanced Settings'));

    await waitFor(() => {
      expect(getByTestId('speculative-decoding-switch')).toBeTruthy();
    });

    // Off → draft cache controls are not rendered.
    expect(queryByText('Draft Key Cache Type')).toBeNull();

    // On → draft cache controls appear.
    runInAction(() => {
      modelStore.contextInitParams.speculativeEnabled = true;
    });
    await waitFor(() => {
      expect(getByText('Draft Key Cache Type')).toBeTruthy();
    });

    runInAction(() => {
      modelStore.contextInitParams.speculativeEnabled = false;
    });
  });

  describe('speculative draft model picker', () => {
    // Menus open from a ref.measure() callback. The test renderer's shared
    // measure mock is a no-op; make it invoke the callback so the menu opens.
    const mockNativeMethods =
      require('react-native/jest/MockNativeMethods').default;
    beforeEach(() => {
      mockNativeMethods.measure.mockImplementation((cb: any) =>
        cb(0, 0, 10, 10, 0, 0),
      );
    });
    afterEach(() => {
      mockNativeMethods.measure.mockReset();
    });

    const openMenu = (element: any) => {
      fireEvent.press(element);
    };

    const setupDraftModels = () => {
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.models = [
          {
            id: 'a/b/draft.gguf',
            name: 'Tiny Draft',
            isDownloaded: true,
          } as any,
        ];
      });
    };

    afterEach(() => {
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = false;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
      });
    });

    const openSpeculative = async (getByTestId: any, getByText: any) => {
      fireEvent.press(getByText('Advanced Settings'));
      await waitFor(() => {
        expect(getByTestId('speculative-decoding-switch')).toBeTruthy();
      });
    };

    it('picking a draft model calls setSelectedDraftModel with its id', async () => {
      jest.useFakeTimers();
      setupDraftModels();
      const {getByTestId, getByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await openSpeculative(getByTestId, getByText);

      openMenu(getByTestId('speculative-draft-model-picker'));
      await waitFor(() => {
        expect(getByText('Tiny Draft')).toBeTruthy();
      });
      fireEvent.press(getByText('Tiny Draft'));

      expect(modelStore.setSelectedDraftModel).toHaveBeenCalledWith(
        'a/b/draft.gguf',
      );
    });

    it('picking None clears the draft model (undefined)', async () => {
      jest.useFakeTimers();
      setupDraftModels();
      runInAction(() => {
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/draft.gguf';
      });
      const {getByTestId, getByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await openSpeculative(getByTestId, getByText);

      openMenu(getByTestId('speculative-draft-model-picker'));
      await waitFor(() => {
        expect(getByText('None (embedded MTP)')).toBeTruthy();
      });
      fireEvent.press(getByText('None (embedded MTP)'));

      expect(modelStore.setSelectedDraftModel).toHaveBeenCalledWith(undefined);
    });

    it('the draft GPU-layers slider writes setSpecDraftNGpuLayers', async () => {
      jest.useFakeTimers();
      setupDraftModels();
      const {getByTestId, getByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await openSpeculative(getByTestId, getByText);

      const slider = getByTestId('speculative-draft-gpu-layers-slider');
      act(() => {
        fireEvent(slider, 'valueChange', 42);
      });
      // InputSlider debounces onValueChange (default 300ms).
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(modelStore.setSpecDraftNGpuLayers).toHaveBeenCalledWith(42);
    });

    it('draft cache label shows the effective default (f16 when a draft is picked)', async () => {
      jest.useFakeTimers();
      setupDraftModels();
      runInAction(() => {
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/draft.gguf';
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
      });
      const {getByTestId, getByText, queryByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await openSpeculative(getByTestId, getByText);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      // Effective paired default is f16, not the "None" string.
      expect(
        queryByText(l10n.en.settings.speculativeDraftModelNone),
      ).toBeNull();
      const keyCacheButton = getByTestId('speculative-draft-key-cache-button');
      expect(keyCacheButton.props.accessibilityState?.disabled).toBeFalsy();
    });

    it('draft cache menus are disabled with an explanation when no draft is paired (embedded)', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.models = [];
      });
      const {getByTestId, getByText, getAllByText} = render(
        <SettingsScreen />,
        {
          withSafeArea: true,
          withNavigation: true,
        },
      );

      await openSpeculative(getByTestId, getByText);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      const keyCacheButton = getByTestId('speculative-draft-key-cache-button');
      expect(keyCacheButton.props.accessibilityState?.disabled).toBe(true);
      // The explanation appears on both the key and value cache rows.
      expect(
        getAllByText(
          l10n.en.settings.speculativeDraftCacheTypeDisabledDescription,
        ).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('paired draft renders the f16 effective-default label (positive assertion)', async () => {
      jest.useFakeTimers();
      setupDraftModels();
      runInAction(() => {
        // A draft is picked but no explicit cache type set → label must resolve
        // to the EFFECTIVE paired default (f16), not the "None" string and not
        // an empty/wrong value.
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/draft.gguf';
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_v = undefined;
      });
      const {getByTestId, getByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await openSpeculative(getByTestId, getByText);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      // The f16 cache option renders 'F16 (Default)' (flashAttnCompatibility),
      // shown for BOTH the key and value draft cache rows. Substring match —
      // the button prepends a chevron icon glyph to the label text content.
      expect(getByTestId('speculative-draft-key-cache-button')).toHaveTextContent(
        /F16 \(Default\)/,
      );
      expect(
        getByTestId('speculative-draft-value-cache-button'),
      ).toHaveTextContent(/F16 \(Default\)/);
    });

    it('embedded mode renders the q8_0 effective-default label (positive assertion)', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        // No global pick and no per-target draft → effectively embedded; the
        // draft cache rows must show the embedded default (q8_0), not f16 and
        // not the "None" string.
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_v = undefined;
        modelStore.models = [];
      });
      const {getByTestId, getByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await openSpeculative(getByTestId, getByText);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      expect(getByTestId('speculative-draft-key-cache-button')).toHaveTextContent(
        /Q8_0/,
      );
      expect(
        getByTestId('speculative-draft-value-cache-button'),
      ).toHaveTextContent(/Q8_0/);
    });
  });

  describe('TTS availability toggle', () => {
    afterEach(() => {
      // Reset observable fields between tests — beforeEach's clearAllMocks()
      // resets jest.fn() call lists but not field values.
      runInAction(() => {
        ttsStore.deviceMeetsMemory = false;
        ttsStore.userTTSOverride = null;
      });
    });

    it('§6.A — high-memory, no override: switch ON, helper line hidden', async () => {
      runInAction(() => {
        ttsStore.deviceMeetsMemory = true;
        ttsStore.userTTSOverride = null;
      });
      const {getByTestId, queryByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      const sw = getByTestId('tts-availability-switch');
      expect(sw.props.value).toBe(true);
      expect(
        queryByText(l10n.en.settings.ttsAvailabilityLowMemoryWarning),
      ).toBeNull();
    });

    it('§6.B — low-memory, no override: switch OFF, helper line visible', async () => {
      runInAction(() => {
        ttsStore.deviceMeetsMemory = false;
        ttsStore.userTTSOverride = null;
      });
      const {getByTestId, getByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      const sw = getByTestId('tts-availability-switch');
      expect(sw.props.value).toBe(false);
      expect(
        getByText(l10n.en.settings.ttsAvailabilityLowMemoryWarning),
      ).toBeTruthy();
    });

    it('§6.C — low-memory: toggling ON calls setUserTTSOverride(true)', async () => {
      runInAction(() => {
        ttsStore.deviceMeetsMemory = false;
        ttsStore.userTTSOverride = null;
      });
      const {getByTestId} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });
      const sw = getByTestId('tts-availability-switch');

      await act(async () => {
        fireEvent(sw, 'valueChange', true);
      });

      expect(ttsStore.setUserTTSOverride).toHaveBeenCalledWith(true);
    });

    it('§6.D — high-memory: toggling OFF calls setUserTTSOverride(false)', async () => {
      runInAction(() => {
        ttsStore.deviceMeetsMemory = true;
        ttsStore.userTTSOverride = null;
      });
      const {getByTestId} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });
      const sw = getByTestId('tts-availability-switch');

      await act(async () => {
        fireEvent(sw, 'valueChange', false);
      });

      expect(ttsStore.setUserTTSOverride).toHaveBeenCalledWith(false);
    });

    it('§9f — low-memory + opt-in: switch ON, helper line still visible', async () => {
      runInAction(() => {
        ttsStore.deviceMeetsMemory = false;
        ttsStore.userTTSOverride = true;
      });
      const {getByTestId, getByText} = render(<SettingsScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      const sw = getByTestId('tts-availability-switch');
      expect(sw.props.value).toBe(true);
      // Helper line tracks deviceMeetsMemory, NOT the override.
      expect(
        getByText(l10n.en.settings.ttsAvailabilityLowMemoryWarning),
      ).toBeTruthy();
    });
  });

  it('shows effective value when image_max_tokens exceeds n_ctx', async () => {
    jest.useFakeTimers();
    const {getByText, queryByText} = render(<SettingsScreen />, {
      withSafeArea: true,
      withNavigation: true,
    });

    // Expand advanced settings
    fireEvent.press(getByText('Advanced Settings'));

    await waitFor(() => {
      // Initially, with image_max_tokens = 512 and n_ctx = 2048, no effective label should show
      expect(queryByText(/effective:/)).toBeFalsy();
    });

    // Now set image_max_tokens > n_ctx to trigger effective display
    act(() => {
      modelStore.contextInitParams.image_max_tokens = 3000;
    });

    await waitFor(() => {
      // Should show effective value clamped to n_ctx (2048)
      expect(getByText(/effective: 2048/)).toBeTruthy();
    });
  });
});
