import React from 'react';
import {Platform} from 'react-native';

import {
  fireEvent,
  render as baseRender,
  waitFor,
  act,
} from '../../../../jest/test-utils';

import {PreferencesScreen} from '../PreferencesScreen';

import {modelStore, uiStore, hfStore} from '../../../store';

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
});
