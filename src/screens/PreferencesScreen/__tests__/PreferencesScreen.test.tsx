import React from 'react';
import {Platform} from 'react-native';

import {
  fireEvent,
  render as baseRender,
  waitFor,
  act,
} from '../../../../jest/test-utils';

import {PreferencesScreen} from '../PreferencesScreen';

import {modelStore, uiStore} from '../../../store';

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
});
