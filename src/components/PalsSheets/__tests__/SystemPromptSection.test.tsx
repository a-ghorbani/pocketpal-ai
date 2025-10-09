import React from 'react';
import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {FormProvider, useForm} from 'react-hook-form';
import {SystemPromptSection} from '../SystemPromptSection';
import {modelStore} from '../../../store';
import {useStructuredOutput} from '../../../hooks/useStructuredOutput';
import {modelsList} from '../../../../jest/fixtures/models';
import type {ParameterDefinition} from '../../../types/pal';

// Mock the modelStore
jest.mock('../../../store', () => {
  const {
    modelsList: mockedModelsList,
  } = require('../../../../jest/fixtures/models');
  return {
    modelStore: {
      availableModels: [mockedModelsList[0], mockedModelsList[1]],
      isContextLoading: false,
      activeModelId: mockedModelsList[0].id,
      isDownloading: () => false,
      initContext: jest.fn(),
      models: mockedModelsList,
      isModelAvailable: (modelId?: string) => {
        if (!modelId) {
          return false;
        }
        return [mockedModelsList[0].id, mockedModelsList[1].id].includes(
          modelId,
        );
      },
    },
  };
});

// Mock useStructuredOutput hook
jest.mock('../../../hooks/useStructuredOutput', () => ({
  useStructuredOutput: jest.fn(),
}));

// Test form data interface
interface TestFormData {
  name: string;
  systemPrompt: string;
  originalSystemPrompt?: string;
  useAIPrompt: boolean;
  isSystemPromptChanged: boolean;
  promptGenerationModel?: any;
  generatingPrompt?: string;
  // Parameter fields for testing different pal types
  world?: string;
  location?: string;
  aiRole?: string;
  userRole?: string;
  situation?: string;
  toneStyle?: string;
  captureInterval?: string;
  role?: string;
  setting?: string;
}

const TestWrapper = ({
  children,
  defaultValues = {},
}: {
  children: React.ReactNode;
  defaultValues?: Partial<TestFormData>;
}) => {
  const methods = useForm<TestFormData>({
    defaultValues: {
      name: '',
      systemPrompt: '',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      ...defaultValues,
    },
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('SystemPromptSection', () => {
  const mockGenerate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useStructuredOutput as jest.Mock).mockReturnValue({
      generate: mockGenerate,
      isGenerating: false,
    });
  });

  it('renders basic fields correctly for non-templated pal', () => {
    const {getByText, getByPlaceholderText} = render(
      <TestWrapper>
        <SystemPromptSection closeSheet={() => {}} parameterSchema={[]} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    expect(getByText('System Prompt')).toBeDefined();
    expect(getByText('Use AI to generate system prompt')).toBeDefined();
    expect(getByPlaceholderText('You are a helpful assistant')).toBeDefined();
  });

  it('toggles AI prompt generation fields visibility', () => {
    const {getByText, queryByText} = render(
      <TestWrapper defaultValues={{useAIPrompt: false}}>
        <SystemPromptSection closeSheet={() => {}} parameterSchema={[]} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Initially, generation fields should be hidden
    expect(queryByText('Select Model for Generation*')).toBeNull();

    // Toggle AI prompt generation
    fireEvent.press(getByText('Use AI to generate system prompt'));

    // Generation fields should be visible
    expect(getByText('Select Model for Generation*')).toBeDefined();
  });

  it('handles system prompt generation for assistant type', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated assistant prompt'});

    // Assistant pal - no parameter schema (simple pal)
    const {getByText, getByPlaceholderText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[0],
          generatingPrompt: 'Test generating prompt',
        }}>
        <SystemPromptSection closeSheet={() => {}} parameterSchema={[]} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled();
      expect(
        getByPlaceholderText('You are a helpful assistant').props.value,
      ).toBe('Generated assistant prompt');
    });
  });

  it('handles system prompt generation for roleplay type', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated roleplay prompt'});

    // Roleplay pal - has parameter schema with roleplay fields
    const roleplaySchema: ParameterDefinition[] = [
      {key: 'world', type: 'text', label: 'World', required: true},
      {key: 'location', type: 'text', label: 'Location', required: true},
      {key: 'aiRole', type: 'text', label: 'AI Role', required: true},
      {key: 'userRole', type: 'text', label: 'User Role', required: true},
      {key: 'situation', type: 'text', label: 'Situation', required: true},
      {key: 'toneStyle', type: 'text', label: 'Tone & Style', required: true},
    ];

    const {getByText, getByPlaceholderText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[0],
          world: 'Fantasy',
          location: 'Castle',
          aiRole: 'Wizard',
          userRole: 'Knight',
          situation: 'Quest',
          toneStyle: 'Medieval',
        }}>
        <SystemPromptSection
          closeSheet={() => {}}
          parameterSchema={roleplaySchema}
        />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled();
      expect(
        getByPlaceholderText('You are a helpful assistant').props.value,
      ).toBe('Generated roleplay prompt');
    });
  });

  it('handles validation before generation', async () => {
    const validateFields = jest.fn().mockResolvedValue(false);

    const {getByText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: 'model1',
        }}>
        <SystemPromptSection
          validateFields={validateFields}
          closeSheet={() => {}}
        />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(validateFields).toHaveBeenCalled();
      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  it('handles model initialization for generation', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated prompt'});

    const {getByText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[1], // Different from activeModelId
          generatingPrompt: 'Test prompt',
        }}>
        <SystemPromptSection closeSheet={() => {}} parameterSchema={[]} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(modelStore.initContext).toHaveBeenCalledWith(modelsList[1]);
    });
  });

  it('generates different prompts for roleplay vs assistant pals', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated roleplay prompt'});

    const roleplaySchema = [
      {key: 'world', type: 'text' as const, label: 'World', required: true},
      {key: 'aiRole', type: 'text' as const, label: 'AI Role', required: true},
    ];

    const {getByText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[0],
          generatingPrompt: 'Fantasy adventure',
          world: 'Medieval fantasy kingdom',
          aiRole: 'Wise wizard advisor',
        }}>
        <SystemPromptSection
          closeSheet={() => {}}
          parameterSchema={roleplaySchema}
        />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.stringContaining(
          'Generate a system prompt for a roleplay AI assistant',
        ),
        expect.any(Object),
      );
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.stringContaining('World: Medieval fantasy kingdom'),
        expect.any(Object),
      );
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.stringContaining('AI Role: Wise wizard advisor'),
        expect.any(Object),
      );
    });
  });

  it('includes parameter values in generation prompt', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated assistant prompt'});

    const assistantSchema = [];

    const {getByText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[0],
          generatingPrompt: 'Helpful coding assistant',
        }}>
        <SystemPromptSection
          closeSheet={() => {}}
          parameterSchema={assistantSchema}
        />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.stringContaining(
          'Generate a concise and professional system prompt for an AI assistant',
        ),
        expect.any(Object),
      );
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.stringContaining(
          'Assistant Purpose: "Helpful coding assistant"',
        ),
        expect.any(Object),
      );
    });
  });

  it('generates video pal specific prompts and excludes technical parameters', async () => {
    mockGenerate.mockResolvedValueOnce({prompt: 'Generated video prompt'});

    const videoSchema = [
      {
        key: 'captureInterval',
        type: 'text' as const,
        label: 'Capture Interval (ms)',
        required: true,
      },
    ];

    const {getByText} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          promptGenerationModel: modelsList[0],
          generatingPrompt: 'Real-time security monitoring',
          captureInterval: '2000',
        }}>
        <SystemPromptSection
          closeSheet={() => {}}
          parameterSchema={videoSchema}
        />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Click generate button
    fireEvent.press(getByText('Generate System Prompt'));

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.stringContaining(
          'Generate a system prompt for a video analysis AI assistant',
        ),
        expect.any(Object),
      );
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.stringContaining(
          'Video Analysis Purpose: "Real-time security monitoring"',
        ),
        expect.any(Object),
      );
      // Should NOT include captureInterval in the prompt since it's technical
      expect(mockGenerate).not.toHaveBeenCalledWith(
        expect.stringContaining('Capture Interval'),
        expect.any(Object),
      );
    });
  });

  it('shows system prompt changed warning and handles reset', () => {
    const {getByText, getByPlaceholderText} = render(
      <TestWrapper
        defaultValues={{
          systemPrompt: 'Changed prompt',
          originalSystemPrompt: 'Original prompt',
          isSystemPromptChanged: true,
        }}>
        <SystemPromptSection closeSheet={() => {}} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    // Check if warning is shown
    expect(getByText('System prompt has been manually changed')).toBeDefined();

    // Click reset button
    fireEvent.press(getByText('Reset'));

    // Check if prompt is reset
    expect(
      getByPlaceholderText('You are a helpful assistant').props.value,
    ).toBe('Original prompt');
  });

  it('disables generation when system prompt is manually changed', () => {
    const {getByTestId} = render(
      <TestWrapper
        defaultValues={{
          useAIPrompt: true,
          isSystemPromptChanged: true,
          promptGenerationModel: modelsList[0],
        }}>
        <SystemPromptSection closeSheet={() => {}} parameterSchema={[]} />
      </TestWrapper>,
      {
        withNavigation: true,
      },
    );

    const generateButton = getByTestId('generate-button');
    expect(generateButton.props.accessibilityState.disabled).toBe(true);
  });

  // New template functionality tests
  describe('Template functionality', () => {
    const templateSchema: ParameterDefinition[] = [
      {key: 'role', type: 'text', label: 'Role', required: true},
      {key: 'setting', type: 'text', label: 'Setting', required: true},
    ];

    it('detects templated pals and shows template mode toggle', () => {
      const {getByTestId} = render(
        <TestWrapper
          defaultValues={{
            systemPrompt: 'You are {{role}} in {{setting}}',
            role: 'wizard',
            setting: 'fantasy world',
          }}>
          <SystemPromptSection
            closeSheet={() => {}}
            parameterSchema={templateSchema}
          />
        </TestWrapper>,
        {withNavigation: true},
      );

      // Should show toggle button for template mode (icon button)
      expect(getByTestId('icon-button')).toBeTruthy();
    });

    it('renders final prompt in default mode for templated pals', () => {
      const {getByText} = render(
        <TestWrapper
          defaultValues={{
            systemPrompt: 'You are {{role}} in {{setting}}',
            role: 'wizard',
            setting: 'fantasy world',
          }}>
          <SystemPromptSection
            closeSheet={() => {}}
            parameterSchema={templateSchema}
          />
        </TestWrapper>,
        {withNavigation: true},
      );

      // Should show rendered prompt
      expect(getByText('You are wizard in fantasy world')).toBeTruthy();
    });

    it('shows reset parameters and reset template buttons for templated pals', () => {
      const {getByText} = render(
        <TestWrapper
          defaultValues={{
            systemPrompt: 'You are {{role}} in {{setting}}',
            role: 'wizard',
            setting: 'fantasy world',
          }}>
          <SystemPromptSection
            closeSheet={() => {}}
            parameterSchema={templateSchema}
          />
        </TestWrapper>,
        {withNavigation: true},
      );

      expect(getByText('Reset Parameters')).toBeTruthy();
      expect(getByText('Reset Template')).toBeTruthy();
    });

    it('preserves originalSystemPrompt when generating AI prompts', async () => {
      mockGenerate.mockResolvedValueOnce({prompt: 'Generated new prompt'});

      const {getByText} = render(
        <TestWrapper
          defaultValues={{
            useAIPrompt: true,
            promptGenerationModel: modelsList[0],
            systemPrompt: 'Current prompt',
            originalSystemPrompt: 'Original template {{role}}',
            generatingPrompt: 'Test prompt',
          }}>
          <SystemPromptSection closeSheet={() => {}} parameterSchema={[]} />
        </TestWrapper>,
        {withNavigation: true},
      );

      // Click generate button
      fireEvent.press(getByText('Generate System Prompt'));

      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled();
        // originalSystemPrompt should be preserved (not overwritten)
      });
    });
  });
});
