import React from 'react';
import {Alert} from 'react-native';

import {runInAction} from 'mobx';

import {
  render as baseRender,
  fireEvent,
  waitFor,
  act,
} from '../../../../jest/test-utils';

import {VideoPalScreen} from '../VideoPalScreen';
import {palStore, chatSessionStore, modelStore, ttsStore} from '../../../store';
import type {Pal} from '../../../types/pal';
import {LlamaContext} from 'llama.rn';
import {ModelOrigin} from '../../../utils/types';
import {mockLlamaContextParams} from '../../../../jest/fixtures/models';

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
    runInAction(() => {
      modelStore.isMultimodalActive = false;
      modelStore.activeModelId = undefined;
      modelStore.models = [];
    });
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
    modelStore.context = new LlamaContext(mockLlamaContextParams);

    // Multimodal is not active on the loaded model
    runInAction(() => {
      modelStore.isMultimodalActive = false;
    });

    const alertSpy = jest.spyOn(Alert, 'alert');

    const {getByLabelText} = render(<VideoPalScreen activePal={videoPal} />);

    fireEvent.press(getByLabelText('Start video analysis'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    // Check the call arguments
    const callArgs = alertSpy.mock.calls[0];
    expect(callArgs[0]).toBe('Multimodal Not Enabled');
    expect(callArgs[1]).toBe(
      'This model does not support image analysis. Please load a multimodal model.',
    );
    expect(callArgs[2]).toEqual(expect.any(Array));
  });

  it('starts camera when multimodal is enabled, allows interval change, and closes back to chat', async () => {
    const videoPal = makeVideoPal();
    (palStore as any).pals.push(videoPal);
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => videoPal.id),
      configurable: true,
    });

    // Provide a loaded context
    modelStore.context = new LlamaContext(mockLlamaContextParams);

    // Allow multimodal
    runInAction(() => {
      modelStore.models = [
        {id: 'model-1', origin: ModelOrigin.PRESET, supportsMultimodal: true},
      ] as any;
      modelStore.activeModelId = 'model-1';
      modelStore.isMultimodalActive = true;
    });

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

  describe('under the generation lease', () => {
    function openCamera() {
      const videoPal = makeVideoPal();
      (palStore as any).pals.push(videoPal);
      Object.defineProperty(chatSessionStore, 'activePalId', {
        get: jest.fn(() => videoPal.id),
        configurable: true,
      });
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      runInAction(() => {
        modelStore.models = [
          {id: 'model-1', origin: ModelOrigin.PRESET, supportsMultimodal: true},
        ] as any;
        modelStore.activeModelId = 'model-1';
        modelStore.isMultimodalActive = true;
        modelStore.engine = {
          completion: jest.fn(),
          stopCompletion: jest.fn(),
        };
      });
      return render(<VideoPalScreen activePal={videoPal} />);
    }

    afterEach(() => {
      runInAction(() => {
        modelStore.engine = undefined;
      });
      delete (modelStore as any).startImageCompletion;
    });

    it('closing the camera aborts the running generation', async () => {
      const {getByLabelText, getByTestId} = openCamera();
      fireEvent.press(getByLabelText('Start video analysis'));
      await waitFor(() => expect(getByTestId('close-button')).toBeTruthy());

      fireEvent.press(getByTestId('close-button'));

      expect(modelStore.abortActiveGeneration).toHaveBeenCalledTimes(1);
    });

    it('closes the old camera session when switching Video Pals', async () => {
      const {getByLabelText, getByTestId, queryByTestId, rerender} =
        openCamera();
      fireEvent.press(getByLabelText('Start video analysis'));
      await waitFor(() => expect(getByTestId('close-button')).toBeTruthy());

      rerender(
        <VideoPalScreen activePal={makeVideoPal({id: 'another-video-pal'})} />,
      );

      await waitFor(() => expect(queryByTestId('close-button')).toBeNull());
      expect(getByLabelText('Start video analysis')).toBeTruthy();
      expect(modelStore.abortActiveGeneration).toHaveBeenCalledTimes(1);
    });

    it.each(['close', 'unmount'])(
      'ignores late speech callbacks after %s',
      async end => {
        let callbacks: any;
        (modelStore as any).startImageCompletion = jest.fn(async params => {
          callbacks = params;
        });
        const {getByLabelText, getByTestId, UNSAFE_root, unmount} =
          openCamera();
        fireEvent.press(getByLabelText('Start video analysis'));
        await waitFor(() => expect(getByTestId('close-button')).toBeTruthy());
        const capture = UNSAFE_root.findAll(
          node => typeof node.props.onCapture === 'function',
        )[0].props.onCapture;
        await act(async () => {
          await capture('data:frame');
        });
        expect(callbacks).toBeDefined();
        if (end === 'close') {
          fireEvent.press(getByTestId('close-button'));
        } else {
          unmount();
        }
        jest.clearAllMocks();
        act(() => {
          callbacks.onToken('Late reply.');
          callbacks.onComplete('Late reply.');
        });
        expect(ttsStore.onAssistantMessageStart).not.toHaveBeenCalled();
        expect(ttsStore.onAssistantMessageComplete).not.toHaveBeenCalled();
      },
    );

    it('drops a frame that arrives while a generation holds the lease', async () => {
      (modelStore as any).startImageCompletion = jest.fn();
      const {getByLabelText, getByTestId, UNSAFE_root} = openCamera();
      fireEvent.press(getByLabelText('Start video analysis'));
      await waitFor(() => expect(getByTestId('close-button')).toBeTruthy());
      const capture = (frame: string) =>
        UNSAFE_root.findAll(
          node => typeof node.props.onCapture === 'function',
        )[0].props.onCapture(frame);
      const held = modelStore.tryAcquireGeneration();

      await capture('data:frame');
      expect((modelStore as any).startImageCompletion).not.toHaveBeenCalled();

      held!.end();
      await capture('data:frame');
      expect((modelStore as any).startImageCompletion).toHaveBeenCalledTimes(1);
    });
  });
});
