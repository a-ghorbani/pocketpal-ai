import React from 'react';
import {Platform} from 'react-native';

import {runInAction} from 'mobx';

import {
  fireEvent,
  render as baseRender,
  waitFor,
  act,
} from '../../../../jest/test-utils';

import {PreferencesScreen} from '../PreferencesScreen';

import {modelStore, uiStore, hfStore} from '../../../store';
import {l10n} from '../../../locales';

jest.useFakeTimers();

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {
    withSafeArea: true,
    withNavigation: true,
    withBottomSheetProvider: true,
    ...options,
  });

describe('PreferencesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders the context-size input with the configured value (testID survives move)', () => {
    const {getByTestId, getByDisplayValue} = render(<PreferencesScreen />);
    expect(getByTestId('context-size-input')).toBeTruthy();
    expect(getByDisplayValue('2048')).toBeTruthy();
  });

  it('keeps the context-size writer wired after the move', async () => {
    jest.useFakeTimers();
    const {getByDisplayValue} = render(<PreferencesScreen />);
    const input = getByDisplayValue('2048');

    act(() => {
      fireEvent.changeText(input, '512');
    });
    act(() => {
      jest.advanceTimersByTime(501);
    });

    await waitFor(() => {
      expect(modelStore.setNContext).toHaveBeenCalledWith(512);
    });
  });

  it('renders the dissolved Advanced sliders flat (no accordion expansion needed)', () => {
    const {getByTestId} = render(<PreferencesScreen />);
    expect(getByTestId('batch-size-slider')).toBeTruthy();
    expect(getByTestId('ubatch-size-slider')).toBeTruthy();
    expect(getByTestId('thread-count-slider')).toBeTruthy();
    expect(getByTestId('image-max-tokens-slider')).toBeTruthy();
  });

  it('toggles Auto Offload/Load through its existing writer', async () => {
    const {getByTestId} = render(<PreferencesScreen />);
    await act(async () => {
      fireEvent(getByTestId('auto-offload-load-switch'), 'valueChange', false);
    });
    expect(modelStore.updateUseAutoRelease).toHaveBeenCalledWith(false);
  });

  it('toggles Auto-Navigate to Chat through its existing writer', async () => {
    const {getByTestId} = render(<PreferencesScreen />);
    await act(async () => {
      fireEvent(
        getByTestId('auto-navigate-to-chat-switch'),
        'valueChange',
        false,
      );
    });
    expect(uiStore.setAutoNavigateToChat).toHaveBeenCalledWith(false);
  });

  it('toggles memory-lock and memory-mapping switches through their writers', async () => {
    const {getByTestId} = render(<PreferencesScreen />);
    await act(async () => {
      fireEvent(getByTestId('use-mlock-switch'), 'valueChange', true);
    });
    expect(modelStore.setUseMlock).toHaveBeenCalledWith(true);

    await act(async () => {
      fireEvent(getByTestId('use-mmap-switch'), 'valueChange', false);
    });
    expect(modelStore.setUseMmap).toHaveBeenCalledWith('false');
  });

  it('renders the weight-repacking switch only on Android', () => {
    Platform.OS = 'android';
    const {getByTestId} = render(<PreferencesScreen />);
    expect(getByTestId('weight-repacking-switch')).toBeTruthy();
    Platform.OS = 'ios';
  });

  it('renders device-option-* segments and the gpu-layers slider when multiple devices exist', async () => {
    Platform.OS = 'ios';
    const {getByTestId, findByTestId} = render(<PreferencesScreen />);
    // device options load async on mount (iOS exposes auto/gpu/cpu).
    expect(await findByTestId('device-option-auto')).toBeTruthy();
    expect(getByTestId('gpu-layers-slider')).toBeTruthy();
  });

  it('keeps the gpu-layers writer wired (single writer setNGPULayers)', async () => {
    Platform.OS = 'ios';
    const {findByTestId} = render(<PreferencesScreen />);
    const slider = await findByTestId('gpu-layers-slider');
    act(() => {
      fireEvent(slider, 'valueChange', 12);
    });
    // InputSlider debounces onValueChange (300ms default).
    act(() => {
      jest.advanceTimersByTime(301);
    });
    await waitFor(() => {
      expect(modelStore.setNGPULayers).toHaveBeenCalledWith(12);
    });
  });

  it('renders the use-hf-token switch and routes through hfStore.setUseHfToken when a token is present', async () => {
    (hfStore as any).hfToken = 'hf_present';
    hfStore.useHfToken = true;
    const {getByTestId} = render(<PreferencesScreen />);
    const sw = getByTestId('use-hf-token-switch');
    expect(sw).toBeTruthy();
    await act(async () => {
      fireEvent(sw, 'valueChange', false);
    });
    expect(hfStore.setUseHfToken).toHaveBeenCalledWith(false);
    (hfStore as any).hfToken = '';
  });

  it('disables the use-hf-token switch when no token is present (condition preserved)', () => {
    (hfStore as any).hfToken = '';
    const {getByTestId} = render(<PreferencesScreen />);
    // DS Switch puts testID on the wrapper View; the `disabled` prop is
    // forwarded to the inner Paper switch.
    const wrapper: any = getByTestId('use-hf-token-switch');
    const disabledNodes = wrapper.findAll(
      (node: any) => node.props?.disabled === true,
    );
    expect(disabledNodes.length).toBeGreaterThan(0);
  });

  it('toggles the speculative decoding switch in advanced settings', async () => {
    jest.useFakeTimers();
    const {getByTestId} = render(<PreferencesScreen />);

    // Expand advanced settings to reveal the speculative section.

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
    const {getByTestId, getByText, queryByText} = render(<PreferencesScreen />);

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

    // Pairing needs an MTP-capable draft whose width matches the ACTIVE target;
    // anything else runs embedded or off.
    const setupPairedDraft = () => {
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/draft.gguf';
        modelStore.activeModelId = 'active/target.gguf';
        modelStore.models = [
          {
            id: 'active/target.gguf',
            name: 'Target',
            isDownloaded: true,
            ggufMetadata: {n_embd: 1024},
          } as any,
          {
            id: 'a/b/draft.gguf',
            name: 'Tiny Draft',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
        ];
      });
    };

    afterEach(() => {
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = false;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.contextInitParams.flash_attn_type = undefined;
        modelStore.activeModelId = undefined;
      });
    });

    const awaitSpeculative = async (getByTestId: any) => {
      await waitFor(() => {
        expect(getByTestId('speculative-decoding-switch')).toBeTruthy();
      });
    };

    it('picking a draft model calls setSelectedDraftModel with its id', async () => {
      jest.useFakeTimers();
      setupDraftModels();
      const {getByTestId, getByText} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

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
      const {getByTestId, getByText} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

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
      const {getByTestId} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

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

    it('names the switch, draft picker, and GPU-layers slider for screen readers', async () => {
      jest.useFakeTimers();
      setupDraftModels();
      const {getByTestId, getByLabelText} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      const spec = getByLabelText(l10n.en.settings.speculativeDecoding);
      expect(spec.props.accessibilityHint).toBe(
        l10n.en.settings.speculativeDecodingDescription,
      );
      // The row title and description are siblings of the control, so a
      // screen reader only reaches them through the control's own label.
      const picker = getByTestId('speculative-draft-model-picker');
      expect(picker.props.accessibilityLabel).toContain(
        l10n.en.settings.speculativeDraftModel,
      );
      expect(picker.props.accessibilityLabel).toContain(
        l10n.en.settings.speculativeDraftModelNone,
      );
      expect(picker.props.accessibilityHint).toBe(
        l10n.en.settings.speculativeDraftModelDescription,
      );
      const slider = getByTestId('speculative-draft-gpu-layers-slider');
      expect(slider.props.accessibilityLabel).toBe(
        l10n.en.settings.speculativeDraftNGpuLayers,
      );
    });

    it('draft cache label shows the effective default (f16 when a draft is paired)', async () => {
      jest.useFakeTimers();
      setupPairedDraft();
      runInAction(() => {
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
      });
      const {getByTestId, getByText, queryByText} = render(
        <PreferencesScreen />,
      );

      await awaitSpeculative(getByTestId);

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

    it('draft cache menus are disabled with an explanation when nothing resolves to a draft', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.models = [];
      });
      const {getByTestId, getByText, getAllByText} = render(
        <PreferencesScreen />,
      );

      await awaitSpeculative(getByTestId);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      const keyCacheButton = getByTestId('speculative-draft-key-cache-button');
      expect(keyCacheButton.props.accessibilityState?.disabled).toBe(true);
      // The explanation appears on both the key and value cache rows.
      expect(
        getAllByText(
          l10n.en.settings.speculativeDraftCacheTypeInactiveDescription,
        ).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('paired draft renders the f16 effective-default label (positive assertion)', async () => {
      jest.useFakeTimers();
      setupPairedDraft();
      runInAction(() => {
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_v = undefined;
      });
      const {getByTestId, getByText} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      // The f16 cache option renders 'F16 (Default)' (flashAttnCompatibility),
      // shown for BOTH the key and value draft cache rows. Substring match —
      // the button prepends a chevron icon glyph to the label text content.
      expect(
        getByTestId('speculative-draft-key-cache-button'),
      ).toHaveTextContent(/F16 \(Default\)/);
      expect(
        getByTestId('speculative-draft-value-cache-button'),
      ).toHaveTextContent(/F16 \(Default\)/);
    });

    it('embedded + forced flash attn renders the q8_0 effective-default label', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_v = undefined;
        // q8_0 is only the default when flash attention is explicitly on —
        // `auto` can resolve off per backend, where a quantized V draft
        // cache is fatal.
        modelStore.contextInitParams.flash_attn_type = 'on';
        modelStore.activeModelId = 'active/mtp.gguf';
        modelStore.models = [
          {
            id: 'active/mtp.gguf',
            name: 'MTP Active',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
        ];
      });
      const {getByTestId, getByText} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      expect(
        getByTestId('speculative-draft-key-cache-button'),
      ).toHaveTextContent(/Q8_0/);
      expect(
        getByTestId('speculative-draft-value-cache-button'),
      ).toHaveTextContent(/Q8_0/);
    });

    it('stale selection (set id that does not resolve to a downloaded model) is treated as embedded/None', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'gone/draft.gguf';
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_v = undefined;
        modelStore.activeModelId = 'active/mtp.gguf';
        modelStore.models = [
          {
            id: 'active/mtp.gguf',
            name: 'MTP Active',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
        ];
      });
      const {getByTestId, getByText, queryAllByText} = render(
        <PreferencesScreen />,
      );

      await awaitSpeculative(getByTestId);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      // Button label falls back to None. (Substring match — the button
      // prepends a chevron icon glyph to the label text content.)
      expect(getByTestId('speculative-draft-model-picker')).toHaveTextContent(
        /None \(embedded MTP\)/,
      );
      // Embedded still forwards the draft cache types, so the rows stay editable.
      const keyCacheButton = getByTestId('speculative-draft-key-cache-button');
      expect(keyCacheButton.props.accessibilityState?.disabled).toBeFalsy();
      expect(keyCacheButton).toHaveTextContent(/F16/);
      expect(
        queryAllByText(
          l10n.en.settings.speculativeDraftCacheTypeInactiveDescription,
        ).length,
      ).toBe(0);
    });

    it('resolvable selection (set id present and downloaded) is treated as paired', async () => {
      jest.useFakeTimers();
      setupPairedDraft();
      runInAction(() => {
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
      });
      const {getByTestId, getByText} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      await waitFor(() => {
        expect(getByText('Draft Key Cache Type')).toBeTruthy();
      });
      // Substring match — the button prepends a chevron icon glyph.
      expect(getByTestId('speculative-draft-model-picker')).toHaveTextContent(
        /Tiny Draft/,
      );
      const keyCacheButton = getByTestId('speculative-draft-key-cache-button');
      expect(keyCacheButton.props.accessibilityState?.disabled).toBeFalsy();
    });

    it('a draft carried by some other downloaded model does not pair the active one', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.activeModelId = 'active/plain.gguf';
        modelStore.models = [
          {
            id: 'active/plain.gguf',
            name: 'Plain Active',
            isDownloaded: true,
            ggufMetadata: {n_embd: 1024},
          } as any,
          {
            id: 'other/target.gguf',
            name: 'Other Target',
            isDownloaded: true,
            defaultDraftModel: 'a/b/draft.gguf',
            ggufMetadata: {n_embd: 1024},
          } as any,
          {
            id: 'a/b/draft.gguf',
            name: 'Tiny Draft',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
        ];
      });
      const {getByTestId, getAllByText} = render(<PreferencesScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await awaitSpeculative(getByTestId);

      expect(
        getByTestId('speculative-draft-key-cache-button').props
          .accessibilityState?.disabled,
      ).toBe(true);
      expect(
        getByTestId('speculative-draft-value-cache-button').props
          .accessibilityState?.disabled,
      ).toBe(true);
      expect(
        getAllByText(
          l10n.en.settings.speculativeDraftCacheTypeInactiveDescription,
        ).length,
      ).toBe(2);
      expect(getByTestId('speculative-no-effect-note')).toBeTruthy();
    });

    it('a non-MTP active target with a globally-picked incompatible draft disables the menus and shows the note', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/draft.gguf';
        modelStore.activeModelId = 'active/plain.gguf';
        modelStore.models = [
          {
            id: 'active/plain.gguf',
            name: 'Plain Active',
            isDownloaded: true,
            ggufMetadata: {n_embd: 1024},
          } as any,
          {
            id: 'a/b/draft.gguf',
            name: 'Plain Draft',
            isDownloaded: true,
          } as any,
        ];
      });
      const {getByTestId} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      expect(
        getByTestId('speculative-draft-key-cache-button').props
          .accessibilityState?.disabled,
      ).toBe(true);
      expect(
        getByTestId('speculative-draft-value-cache-button').props
          .accessibilityState?.disabled,
      ).toBe(true);
      expect(getByTestId('speculative-no-effect-note')).toBeTruthy();
    });

    it('an MTP-capable draft whose width differs from the active target does not pair', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/draft.gguf';
        modelStore.activeModelId = 'active/target.gguf';
        modelStore.models = [
          {
            id: 'active/target.gguf',
            name: 'Target',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
          {
            id: 'a/b/draft.gguf',
            name: 'Wide Draft',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 2048},
          } as any,
        ];
      });
      const {getByTestId, queryByTestId} = render(<PreferencesScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await awaitSpeculative(getByTestId);

      // The target still carries embedded MTP layers, so the load runs
      // embedded rather than off.
      const keyCacheButton = getByTestId('speculative-draft-key-cache-button');
      expect(keyCacheButton.props.accessibilityState?.disabled).toBeFalsy();
      expect(keyCacheButton).toHaveTextContent(/F16/);
      expect(queryByTestId('speculative-no-effect-note')).toBeNull();
      // The picked draft was dropped, so the picker row says why.
      expect(
        getByTestId('speculative-draft-model-ignored-note'),
      ).toHaveTextContent(
        l10n.en.settings.speculativeDraftModelIgnoredIncompatible,
      );
    });

    it("the active model's own defaultDraftModel pairs it without a global pick", async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
        modelStore.activeModelId = 'active/target.gguf';
        modelStore.models = [
          {
            id: 'active/target.gguf',
            name: 'Target',
            isDownloaded: true,
            defaultDraftModel: 'a/b/draft.gguf',
            ggufMetadata: {n_embd: 1024},
          } as any,
          {
            id: 'a/b/draft.gguf',
            name: 'Tiny Draft',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
        ];
      });
      const {getByTestId, queryByTestId} = render(<PreferencesScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await awaitSpeculative(getByTestId);

      const keyCacheButton = getByTestId('speculative-draft-key-cache-button');
      expect(keyCacheButton.props.accessibilityState?.disabled).toBeFalsy();
      expect(keyCacheButton).toHaveTextContent(/F16 \(Default\)/);
      expect(queryByTestId('speculative-no-effect-note')).toBeNull();
      expect(queryByTestId('speculative-draft-model-ignored-note')).toBeNull();
    });

    it("the active model's own draft wins over the global pick, and the picker says so", async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'user/pick.gguf';
        modelStore.activeModelId = 'active/target.gguf';
        modelStore.models = [
          {
            id: 'active/target.gguf',
            name: 'Target',
            isDownloaded: true,
            defaultDraftModel: 'a/b/draft.gguf',
            ggufMetadata: {n_embd: 1024},
          } as any,
          {
            id: 'a/b/draft.gguf',
            name: 'Tiny Draft',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
          {
            id: 'user/pick.gguf',
            name: 'User Pick',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
        ];
      });
      const {getByTestId} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      expect(getByTestId('speculative-draft-model-picker')).toHaveTextContent(
        /User Pick/,
      );
      expect(
        getByTestId('speculative-draft-model-ignored-note'),
      ).toHaveTextContent(
        l10n.en.settings.speculativeDraftModelIgnoredOverridden,
      );
    });

    it('with no active model a valid pick drives the cache rows, no ignored note', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/draft.gguf';
        modelStore.contextInitParams.spec_draft_cache_type_k = undefined;
        modelStore.contextInitParams.spec_draft_cache_type_v = undefined;
        modelStore.activeModelId = undefined;
        modelStore.models = [
          {
            id: 'a/b/draft.gguf',
            name: 'Tiny Draft',
            isDownloaded: true,
            ggufMetadata: {nextn_predict_layers: 1, n_embd: 1024},
          } as any,
        ];
      });
      const {getByTestId, queryByTestId} = render(<PreferencesScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await awaitSpeculative(getByTestId);

      const keyCacheButton = getByTestId('speculative-draft-key-cache-button');
      expect(keyCacheButton.props.accessibilityState?.disabled).toBeFalsy();
      expect(keyCacheButton).toHaveTextContent(/F16 \(Default\)/);
      expect(queryByTestId('speculative-draft-model-ignored-note')).toBeNull();
    });

    it('with no active model a pick without draft layers is refused and explained', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/plain.gguf';
        modelStore.activeModelId = undefined;
        modelStore.models = [
          {
            id: 'a/b/plain.gguf',
            name: 'Plain Model',
            isDownloaded: true,
            ggufMetadata: {n_embd: 1024},
          } as any,
        ];
      });
      const {getByTestId} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      expect(
        getByTestId('speculative-draft-key-cache-button').props
          .accessibilityState?.disabled,
      ).toBe(true);
      expect(
        getByTestId('speculative-draft-model-ignored-note'),
      ).toHaveTextContent(
        l10n.en.settings.speculativeDraftModelIgnoredNotCapable,
      );
    });
  });

  describe('key/value cache menus', () => {
    afterEach(() => {
      runInAction(() => {
        modelStore.contextInitParams.flash_attn_type = undefined;
      });
    });

    const awaitCacheRows = async (getByTestId: any) => {
      await waitFor(() => {
        expect(getByTestId('key-cache-type-button')).toBeTruthy();
      });
    };

    it('flash attention off disables both cache menus with an explanation', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.flash_attn_type = 'off';
      });
      const {getByTestId, getAllByText} = render(<PreferencesScreen />);

      await awaitCacheRows(getByTestId);

      expect(
        getByTestId('key-cache-type-button').props.accessibilityState?.disabled,
      ).toBe(true);
      expect(
        getByTestId('value-cache-type-button').props.accessibilityState
          ?.disabled,
      ).toBe(true);
      // Key and value rows share the same disabled explanation.
      expect(
        getAllByText(l10n.en.settings.keyCacheTypeDisabledDescription).length,
      ).toBe(2);
      // The row title and the reason are siblings of the button, so a screen
      // reader only gets them through the button's own label and hint.
      expect(
        getByTestId('key-cache-type-button').props.accessibilityLabel,
      ).toContain(l10n.en.settings.keyCacheType);
      expect(getByTestId('key-cache-type-button').props.accessibilityHint).toBe(
        l10n.en.settings.keyCacheTypeDisabledDescription,
      );
    });

    it('flash attention on enables both cache menus', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.flash_attn_type = 'on';
      });
      const {getByTestId, getByText} = render(<PreferencesScreen />);

      await awaitCacheRows(getByTestId);

      expect(
        getByTestId('key-cache-type-button').props.accessibilityState?.disabled,
      ).toBeFalsy();
      expect(
        getByTestId('value-cache-type-button').props.accessibilityState
          ?.disabled,
      ).toBeFalsy();
      expect(getByText(l10n.en.settings.keyCacheTypeDescription)).toBeTruthy();
    });
  });

  describe('speculative no-effect advisory note', () => {
    const mtpMeta = {nextn_predict_layers: 1} as any;

    afterEach(() => {
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = false;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.activeModelId = undefined;
        modelStore.models = [];
      });
    });

    const awaitSpeculative = async (getByTestId: any) => {
      await waitFor(() => {
        expect(getByTestId('speculative-decoding-switch')).toBeTruthy();
      });
    };

    it('shows the note when speculative is on, the active model is not MTP-capable, and no capable draft is selected', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.activeModelId = 'active/plain.gguf';
        modelStore.models = [
          {
            id: 'active/plain.gguf',
            name: 'Plain Active',
            isDownloaded: true,
          } as any,
        ];
      });
      const {getByTestId} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      expect(getByTestId('speculative-no-effect-note')).toBeTruthy();
    });

    it('shows the note when an incompatible (non-MTP) draft is selected — the coarse "any draft picked" signal would have hidden it', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/draft.gguf';
        modelStore.activeModelId = 'active/plain.gguf';
        modelStore.models = [
          {
            id: 'active/plain.gguf',
            name: 'Plain Active',
            isDownloaded: true,
          } as any,
          {
            id: 'a/b/draft.gguf',
            name: 'Plain Draft',
            isDownloaded: true,
          } as any,
        ];
      });
      const {getByTestId} = render(<PreferencesScreen />);

      await awaitSpeculative(getByTestId);

      expect(getByTestId('speculative-no-effect-note')).toBeTruthy();
    });

    it('hides the note when the active model is MTP-capable', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = undefined;
        modelStore.activeModelId = 'active/mtp.gguf';
        modelStore.models = [
          {
            id: 'active/mtp.gguf',
            name: 'MTP Active',
            isDownloaded: true,
            ggufMetadata: mtpMeta,
          } as any,
        ];
      });
      const {getByTestId, queryByTestId} = render(<PreferencesScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await awaitSpeculative(getByTestId);

      expect(queryByTestId('speculative-no-effect-note')).toBeNull();
    });

    it('hides the note when a width-compatible draft is paired to a non-MTP active model', async () => {
      jest.useFakeTimers();
      runInAction(() => {
        modelStore.contextInitParams.speculativeEnabled = true;
        modelStore.contextInitParams.selectedDraftModelId = 'a/b/capable.gguf';
        modelStore.activeModelId = 'active/plain.gguf';
        modelStore.models = [
          {
            id: 'active/plain.gguf',
            name: 'Plain Active',
            isDownloaded: true,
            ggufMetadata: {n_embd: 1024},
          } as any,
          {
            id: 'a/b/capable.gguf',
            name: 'Capable Draft',
            isDownloaded: true,
            ggufMetadata: {...mtpMeta, n_embd: 1024},
          } as any,
        ];
      });
      const {getByTestId, queryByTestId} = render(<PreferencesScreen />, {
        withSafeArea: true,
        withNavigation: true,
      });

      await awaitSpeculative(getByTestId);

      expect(queryByTestId('speculative-no-effect-note')).toBeNull();
    });
  });
});
