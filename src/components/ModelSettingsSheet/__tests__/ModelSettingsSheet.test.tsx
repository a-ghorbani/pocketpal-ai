import React from 'react';
import {fireEvent, render, act, waitFor} from '../../../../jest/test-utils';
import {ModelSettingsSheet} from '../ModelSettingsSheet';
import {modelStore, serverStore} from '../../../store';
import {Model, ModelOrigin} from '../../../utils/types';
import {defaultCompletionParams} from '../../../utils/completionSettingsVersions';

// Mock the ModelSettings component
jest.mock('../../../screens/ModelsScreen/ModelSettings', () => {
  const {View} = require('react-native');
  return {
    ModelSettings: ({onChange, onStopWordsChange, onModelNameChange}) => (
      <View testID="model-settings">
        <View
          testID="mock-settings-update"
          onPress={() => onChange('chatTemplate', 'new template')}
        />
        <View
          testID="mock-stop-words-update"
          onPress={() => onStopWordsChange(['stop1', 'stop2'])}
        />
        <View
          testID="mock-model-name-update"
          onPress={() => onModelNameChange('new model name')}
        />
      </View>
    ),
  };
});

// Mock Sheet component
jest.mock('../../../components/Sheet', () => {
  const {View, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  MockSheet.Actions = ({children}) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

describe('ModelSettingsSheet', () => {
  const defaultTemplate = {
    name: 'custom',
    addGenerationPrompt: true,
    bosToken: '<|START|>',
    eosToken: '<|END|>',
    chatTemplate: 'User: {{prompt}}\nAssistant:',
    systemPrompt: 'You are a helpful assistant',
    addBosToken: true,
    addEosToken: true,
  };

  const mockModel: Model = {
    id: 'test-model',
    author: 'test-author',
    name: 'Test Model',
    size: 1000,
    params: 1000000,
    isDownloaded: true,
    downloadUrl: 'https://example.com/model',
    hfUrl: 'https://huggingface.co/test-model',
    progress: 100,
    filename: 'test-model.bin',
    isLocal: false,
    origin: ModelOrigin.PRESET,
    defaultChatTemplate: defaultTemplate,
    chatTemplate: defaultTemplate,
    defaultStopWords: ['test'],
    stopWords: ['test'],
    defaultCompletionSettings: defaultCompletionParams,
    completionSettings: defaultCompletionParams,
  };

  const defaultProps = {
    isVisible: true,
    onClose: jest.fn(),
    model: mockModel,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (serverStore as any).getRemoteModelPreference = jest.fn();
    (serverStore as any).setRemoteModelPreference = jest.fn();
    (serverStore as any).setRemoteModelGenerationSettings = jest.fn();
    (serverStore as any).getRemoteCatalogModel = jest.fn();
    serverStore.servers = [];
    serverStore.remoteReasoning = {};
    modelStore.activeRemoteBinding = undefined;
  });

  it('renders correctly when visible', () => {
    const {getByTestId} = render(<ModelSettingsSheet {...defaultProps} />);

    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByTestId('model-settings')).toBeTruthy();
    expect(getByTestId('sheet-title')).toBeTruthy();
  });

  it('does not render when not visible', () => {
    const {queryByTestId} = render(
      <ModelSettingsSheet {...defaultProps} isVisible={false} />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('returns null when no model is provided', () => {
    const {queryByTestId} = render(
      <ModelSettingsSheet {...defaultProps} model={undefined} />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('handles save settings correctly', async () => {
    const {getByText} = render(<ModelSettingsSheet {...defaultProps} />);

    await act(async () => {
      fireEvent.press(getByText('Save Changes'));
    });

    expect(modelStore.updateModelChatTemplate).toHaveBeenCalledWith(
      mockModel.id,
      mockModel.chatTemplate,
    );
    expect(modelStore.updateModelStopWords).toHaveBeenCalledWith(
      mockModel.id,
      mockModel.stopWords,
    );
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('handles cancel correctly', async () => {
    const {getByText} = render(<ModelSettingsSheet {...defaultProps} />);

    await act(async () => {
      fireEvent.press(getByText('Cancel'));
    });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('handles reset correctly', async () => {
    const {getByText} = render(<ModelSettingsSheet {...defaultProps} />);

    await act(async () => {
      fireEvent.press(getByText('Reset'));
    });

    expect(modelStore.resetModelChatTemplate).toHaveBeenCalledWith(
      mockModel.id,
    );
    expect(modelStore.resetModelStopWords).toHaveBeenCalledWith(mockModel.id);
  });

  it('handles reset model name correctly', async () => {
    const {getByText} = render(<ModelSettingsSheet {...defaultProps} />);

    await act(async () => {
      fireEvent.press(getByText('Reset'));
    });

    expect(modelStore.resetModelName).toHaveBeenCalledWith(mockModel.id);
  });

  it('handles model name change correctly for local models', async () => {
    // Use a local model (not preset) to allow name changes
    const localModel: Model = {
      ...mockModel,
      id: 'local-model',
      origin: ModelOrigin.LOCAL,
    };

    const {getByTestId, getByText} = render(
      <ModelSettingsSheet {...defaultProps} model={localModel} />,
    );

    // Trigger the mock model name update
    await act(async () => {
      fireEvent.press(getByTestId('mock-model-name-update'));
    });

    // Then save
    await act(async () => {
      fireEvent.press(getByText('Save Changes'));
    });

    expect(modelStore.updateModelName).toHaveBeenCalledWith(
      localModel.id,
      'new model name',
    );
  });

  it('updates settings when model changes', () => {
    const {rerender} = render(<ModelSettingsSheet {...defaultProps} />);

    const newModel = {
      ...mockModel,
      chatTemplate: {
        ...defaultTemplate,
        systemPrompt: 'New system prompt',
      },
      stopWords: ['new-stop-word'],
    };

    rerender(<ModelSettingsSheet {...defaultProps} model={newModel} />);

    // The state updates are handled by useEffect, which is tested implicitly
    // through the save/cancel/reset tests
  });

  it('isolates a model parameter override from other models', async () => {
    const target = {
      ...mockModel,
      completionSettings: {
        ...mockModel.completionSettings,
        temperature: 0.25,
      },
    };
    const other = {
      ...mockModel,
      id: 'other-model',
      completionSettings: {
        ...mockModel.completionSettings,
        temperature: 0.9,
      },
    };
    modelStore.models = [target, other];
    const {getByTestId, getByText} = render(
      <ModelSettingsSheet {...defaultProps} model={target} />,
    );

    await waitFor(() =>
      expect(getByTestId('temperature-mode-omit')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(getByTestId('temperature-mode-omit'));
    });
    await act(async () => {
      fireEvent.press(getByText('Save Changes'));
    });

    expect(modelStore.models[0].completionSettings.temperature).toBe(0.25);
    expect(
      modelStore.models[0].completionSettings.generationParameterModes
        ?.temperature,
    ).toBe('omit');
    expect(modelStore.models[1].completionSettings.temperature).toBe(0.9);
    expect(
      modelStore.models[1].completionSettings.generationParameterModes
        ?.temperature,
    ).toBeUndefined();
  });

  describe('reasoning override', () => {
    it('renders the axis-1 reasoning toggle', () => {
      const {getByTestId} = render(<ModelSettingsSheet {...defaultProps} />);
      expect(getByTestId('reasoning-is-reasoning-switch')).toBeTruthy();
    });

    it('renders all six effort chips when graded effort is on', async () => {
      const {getByTestId} = render(<ModelSettingsSheet {...defaultProps} />);
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-is-reasoning-switch'),
          'valueChange',
          true,
        );
      });
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-supports-effort-switch'),
          'valueChange',
          true,
        );
      });
      for (const level of [
        'minimal',
        'low',
        'medium',
        'high',
        'xhigh',
        'max',
      ]) {
        expect(getByTestId(`effort-chip-${level}`)).toBeTruthy();
      }
    });

    it('save writes a user-sourced override beating detection', async () => {
      const {getByTestId, getByText} = render(
        <ModelSettingsSheet {...defaultProps} />,
      );

      // Turn on axis-1, then axis-2. Enabling graded effort pre-selects the
      // standard low/medium/high subset, so saving without touching any chip
      // persists exactly that default.
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-is-reasoning-switch'),
          'valueChange',
          true,
        );
      });
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-supports-effort-switch'),
          'valueChange',
          true,
        );
      });
      await act(async () => {
        fireEvent.press(getByText('Save Changes'));
      });

      expect(modelStore.setReasoningOverride).toHaveBeenCalledWith(
        mockModel.id,
        {
          isReasoning: 'yes',
          source: 'user',
          supportsEffort: true,
          effortValues: ['low', 'medium', 'high'],
          effortSource: 'user',
        },
      );
    });

    it('persists effort levels ordered low→medium→high regardless of tap order', async () => {
      const {getByTestId, getByText} = render(
        <ModelSettingsSheet {...defaultProps} />,
      );

      await act(async () => {
        fireEvent(
          getByTestId('reasoning-is-reasoning-switch'),
          'valueChange',
          true,
        );
      });
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-supports-effort-switch'),
          'valueChange',
          true,
        );
      });
      // Add levels out of order on top of the pre-selected low/medium/high;
      // the saved set must still be canonically ordered.
      await act(async () => {
        fireEvent.press(getByTestId('effort-chip-xhigh'));
      });
      await act(async () => {
        fireEvent.press(getByTestId('effort-chip-minimal'));
      });
      await act(async () => {
        fireEvent.press(getByText('Save Changes'));
      });

      expect(modelStore.setReasoningOverride).toHaveBeenCalledWith(
        mockModel.id,
        expect.objectContaining({
          supportsEffort: true,
          effortValues: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        }),
      );
    });

    it('toggling an effort chip off removes it from the saved set', async () => {
      const {getByTestId, getByText} = render(
        <ModelSettingsSheet {...defaultProps} />,
      );

      await act(async () => {
        fireEvent(
          getByTestId('reasoning-is-reasoning-switch'),
          'valueChange',
          true,
        );
      });
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-supports-effort-switch'),
          'valueChange',
          true,
        );
      });
      // Pre-selected set is low/medium/high; tapping 'low' removes just it.
      await act(async () => {
        fireEvent.press(getByTestId('effort-chip-low'));
      });
      await act(async () => {
        fireEvent.press(getByText('Save Changes'));
      });

      expect(modelStore.setReasoningOverride).toHaveBeenCalledWith(
        mockModel.id,
        expect.objectContaining({
          supportsEffort: true,
          effortValues: ['medium', 'high'],
        }),
      );
    });

    it("saving axis-1 'no' clears axis-2 (inert)", async () => {
      const {getByTestId, getByText} = render(
        <ModelSettingsSheet {...defaultProps} />,
      );
      // The seed is 'unknown' (switch off). Toggle on then off so axis-1 is a
      // deliberate user 'no' (marks the reasoning controls dirty).
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-is-reasoning-switch'),
          'valueChange',
          true,
        );
      });
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-is-reasoning-switch'),
          'valueChange',
          false,
        );
      });
      await act(async () => {
        fireEvent.press(getByText('Save Changes'));
      });
      expect(modelStore.setReasoningOverride).toHaveBeenCalledWith(
        mockModel.id,
        expect.objectContaining({
          isReasoning: 'no',
          source: 'user',
          supportsEffort: false,
          effortValues: [],
          effortSource: 'none',
        }),
      );
    });

    it('save without touching reasoning controls does NOT write an override', async () => {
      const {getByText} = render(<ModelSettingsSheet {...defaultProps} />);
      await act(async () => {
        fireEvent.press(getByText('Save Changes'));
      });
      // An unrelated save must not stamp a source:'user' override onto a
      // fail-open 'unknown' model — that would kill detection + learn-from-stream.
      expect(modelStore.setReasoningOverride).not.toHaveBeenCalled();
    });
  });

  describe('remote model', () => {
    const remoteModel: Model = {
      ...mockModel,
      id: 'server-1/remote-x',
      origin: ModelOrigin.REMOTE,
      serverId: 'server-1',
      remoteModelId: 'remote-x',
    };
    const remoteProps = {...defaultProps, model: remoteModel};

    it('hides the local-only chat template / stop words section', () => {
      const {queryByTestId, getByTestId} = render(
        <ModelSettingsSheet {...remoteProps} />,
      );
      expect(queryByTestId('model-settings')).toBeNull();
      // The reasoning section is still shown.
      expect(getByTestId('reasoning-is-reasoning-switch')).toBeTruthy();
    });

    it('save writes a reasoning override and skips local-only writers', async () => {
      const {getByTestId, getByText} = render(
        <ModelSettingsSheet {...remoteProps} />,
      );
      await act(async () => {
        fireEvent(
          getByTestId('reasoning-is-reasoning-switch'),
          'valueChange',
          true,
        );
      });
      await act(async () => {
        fireEvent.press(getByText('Save Changes'));
      });

      expect(modelStore.setReasoningOverride).toHaveBeenCalledWith(
        remoteModel.id,
        expect.objectContaining({isReasoning: 'yes', source: 'user'}),
      );
      expect(modelStore.updateModelChatTemplate).not.toHaveBeenCalled();
      expect(modelStore.updateModelStopWords).not.toHaveBeenCalled();
      expect(modelStore.updateModelName).not.toHaveBeenCalled();
    });

    it('shows inherited server protocol and a manual model override', async () => {
      serverStore.servers = [
        {
          id: 'server-1',
          name: 'Remote',
          url: 'https://example.test',
          apiMode: 'responses',
        },
      ];
      const {getByTestId} = render(<ModelSettingsSheet {...remoteProps} />);
      expect(getByTestId('model-effective-protocol')).toHaveTextContent(
        'Effective endpoint: Responses · manual server override',
      );

      fireEvent.press(getByTestId('model-api-protocol-dropdown'));
      fireEvent.press(
        getByTestId('model-api-protocol-option-chat-completions'),
      );
      expect(getByTestId('model-effective-protocol')).toHaveTextContent(
        'Effective endpoint: Chat Completions · manual model override',
      );
    });

    it('persists protocol and remote vision preferences together', async () => {
      const {getByTestId, getByText} = render(
        <ModelSettingsSheet {...remoteProps} />,
      );
      fireEvent.press(getByTestId('model-api-protocol-dropdown'));
      fireEvent.press(getByTestId('model-api-protocol-option-responses'));
      fireEvent.press(getByTestId('remote-vision-dropdown'));
      fireEvent.press(getByTestId('remote-vision-option-on'));
      fireEvent.press(getByText('Save Changes'));

      expect(serverStore.setRemoteModelPreference).toHaveBeenCalledWith(
        remoteModel.id,
        expect.objectContaining({wireApi: 'responses', vision: 'on'}),
      );
    });

    it('persists remote generation overrides and requires reselection', async () => {
      const {getByTestId, getByText, queryByTestId} = render(
        <ModelSettingsSheet {...remoteProps} />,
      );
      await waitFor(() =>
        expect(getByTestId('temperature-mode-omit')).toBeTruthy(),
      );

      fireEvent.press(getByTestId('temperature-mode-omit'));
      expect(queryByTestId('remote-reselect-required')).toBeNull();
      fireEvent.press(getByText('Save Changes'));

      expect(serverStore.setRemoteModelGenerationSettings).toHaveBeenCalledWith(
        remoteModel.id,
        expect.objectContaining({
          generationParameterModes: expect.objectContaining({
            temperature: 'omit',
          }),
        }),
      );
    });

    it('restores saved preferences and labels cached catalog resolution', () => {
      (serverStore.getRemoteModelPreference as jest.Mock).mockReturnValue({
        vision: 'off',
      });
      (serverStore.getRemoteCatalogModel as jest.Mock).mockReturnValue({
        endpointSupport: 'known',
        capabilities: {advertisedEndpoints: ['responses']},
        provenance: 'cached',
      });
      const {getByTestId} = render(<ModelSettingsSheet {...remoteProps} />);
      expect(
        getByTestId('model-api-protocol-dropdown').props.accessibilityLabel,
      ).toBe('Inherit');
      expect(
        getByTestId('remote-vision-dropdown').props.accessibilityLabel,
      ).toBe('Off');
      expect(getByTestId('model-effective-protocol')).toHaveTextContent(
        'Effective endpoint: Responses · cached catalog',
      );
    });

    it('shows a reselect-required notice for an active preference edit', () => {
      modelStore.activeRemoteBinding = {
        modelId: remoteModel.id,
        serverId: 'server-1',
        remoteModelId: 'remote-x',
        url: 'https://example.test',
        wireApi: 'chat-completions',
      };
      const {getByTestId} = render(<ModelSettingsSheet {...remoteProps} />);
      fireEvent.press(getByTestId('remote-vision-dropdown'));
      fireEvent.press(getByTestId('remote-vision-option-off'));
      expect(getByTestId('remote-reselect-required')).toBeTruthy();
    });

    it('disables incompatible reasoning controls without overwriting values', async () => {
      serverStore.remoteReasoning[remoteModel.id] = {
        isReasoning: 'yes',
        source: 'user',
        supportsEffort: true,
        effortValues: ['low', 'high'],
        effortSource: 'user',
      };
      (serverStore.getRemoteCatalogModel as jest.Mock).mockReturnValue({
        endpointSupport: 'known',
        capabilities: {advertisedEndpoints: []},
        provenance: 'live',
      });
      const {getByTestId, getByText} = render(
        <ModelSettingsSheet {...remoteProps} />,
      );
      expect(getByTestId('reasoning-is-reasoning-switch').props.disabled).toBe(
        true,
      );
      expect(
        getByTestId('effort-chip-low').props.accessibilityState?.disabled,
      ).toBe(true);

      fireEvent.press(getByTestId('remote-vision-dropdown'));
      fireEvent.press(getByTestId('remote-vision-option-auto'));
      fireEvent.press(getByText('Save Changes'));
      expect(modelStore.setReasoningOverride).not.toHaveBeenCalled();
      expect(serverStore.remoteReasoning[remoteModel.id].effortValues).toEqual([
        'low',
        'high',
      ]);
    });
  });
});
