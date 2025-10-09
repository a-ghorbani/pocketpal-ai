import React from 'react';
import {Alert} from 'react-native';

import {
  render as baseRender,
  fireEvent,
  waitFor,
} from '../../../../jest/test-utils';

import {VideoPalScreen} from '../VideoPalScreen';
import {palStore, chatSessionStore, modelStore} from '../../../store';
import type {Pal} from '../../../types/pal';
import {LlamaContext} from '@pocketpalai/llama.rn';
import {mockContextModel} from '../../../../jest/fixtures/models';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {
    withNavigation: true,
    withSafeArea: true,
    withBottomSheetProvider: true,
    ...options,
  });

function makeVideoPal(overrides: Partial<Pal> = {}): Pal {
  return {
    type: 'local',
    id: 'pal-video-1',
    name: 'Video Pal',
    description: 'Test video pal',
    systemPrompt: '',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameterSchema: [],
    parameters: {captureInterval: 1500},
    source: 'local',
    capabilities: {video: true, multimodal: true},
    ...overrides,
  } as Pal;
}

describe('VideoPalScreen', () => {
  let originalActivePalId: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset pals
    (palStore as any).pals = [];
    // Save and reset activePalId getter
    originalActivePalId = Object.getOwnPropertyDescriptor(
      chatSessionStore,
      'activePalId',
    );
  });

  afterEach(() => {
    // Restore original activePalId getter if it existed
    if (originalActivePalId) {
      Object.defineProperty(
        chatSessionStore,
        'activePalId',
        originalActivePalId,
      );
    }
  });

  it('renders chat view with start-video button and default prompt for a video pal', () => {
    const videoPal = makeVideoPal();
    (palStore as any).pals.push(videoPal);
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => videoPal.id),
      configurable: true,
    });

    const {getByLabelText, getByDisplayValue} = render(
      <VideoPalScreen activePal={videoPal} />,
    );

    // Start-video button should be visible (compact button in ChatInput)
    expect(getByLabelText('Start video analysis')).toBeTruthy();

    // Prompt text is controlled by VideoPalScreen and shown in the input
    expect(getByDisplayValue('What do you see?')).toBeTruthy();
  });

  it('shows an alert when model is not loaded and start is pressed', async () => {
    const videoPal = makeVideoPal();
    (palStore as any).pals.push(videoPal);
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => videoPal.id),
      configurable: true,
    });

    const alertSpy = jest.spyOn(Alert, 'alert');

    const {getByLabelText} = render(<VideoPalScreen activePal={videoPal} />);

    fireEvent.press(getByLabelText('Start video analysis'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    // Title should be localized "Model not loaded" string
    const call = (alertSpy.mock.calls[0] || []) as any[];
    expect(call[0]).toContain('Model not loaded');
  });

  it('alerts when multimodal is not enabled even if a model is loaded', async () => {
    const videoPal = makeVideoPal();
    (palStore as any).pals.push(videoPal);
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => videoPal.id),
      configurable: true,
    });

    // Provide a context so we pass the first guard
    modelStore.context = new LlamaContext({
      contextId: 1,
      gpu: false,
      reasonNoGPU: '',
      model: mockContextModel,
    });

    // Ensure multimodal check resolves to false
    jest.spyOn(modelStore, 'isMultimodalEnabled').mockResolvedValue(false);

    const alertSpy = jest.spyOn(Alert, 'alert');

    const {getByLabelText} = render(<VideoPalScreen activePal={videoPal} />);

    fireEvent.press(getByLabelText('Start video analysis'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Multimodal Not Enabled',
        expect.stringContaining('does not support image analysis'),
        expect.any(Array),
      );
    });
  });

  it('starts camera when multimodal is enabled, allows interval change, and closes back to chat', async () => {
    const videoPal = makeVideoPal();
    (palStore as any).pals.push(videoPal);
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => videoPal.id),
      configurable: true,
    });

    // Provide a loaded context
    modelStore.context = new LlamaContext({
      contextId: 1,
      gpu: false,
      reasonNoGPU: '',
      model: mockContextModel,
    });

    // Allow multimodal
    jest.spyOn(modelStore, 'isMultimodalEnabled').mockResolvedValue(true);

    const {getByLabelText, getByTestId, queryByTestId} = render(
      <VideoPalScreen activePal={videoPal} />,
    );

    // Start camera
    fireEvent.press(getByLabelText('Start video analysis'));

    // EmbeddedVideoView visible (close button present)
    await waitFor(() => expect(getByTestId('close-button')).toBeTruthy());

    // Increase interval -> palStore.updatePal called with new interval
    fireEvent.press(getByTestId('increase-interval-button'));
    await waitFor(() => {
      expect(palStore.updatePal).toHaveBeenCalledWith(
        videoPal.id,
        expect.objectContaining({
          parameters: expect.objectContaining({captureInterval: 2000}),
        }),
      );
    });

    // Close camera
    fireEvent.press(getByTestId('close-button'));

    await waitFor(() => {
      expect(queryByTestId('close-button')).toBeNull();
      expect(getByLabelText('Start video analysis')).toBeTruthy();
    });
  });
});
