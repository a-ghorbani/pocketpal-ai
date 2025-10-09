import React from 'react';
import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {PalSheet} from '../PalSheet';
import {l10n} from '../../../utils/l10n';
import {L10nContext} from '../../../utils';
import type {Pal} from '../../../types/pal';
import {modelsList} from '../../../../jest/fixtures/models';
import type {ParameterDefinition} from '../../../types/pal';

// Mock the Sheet component
jest.mock('../../Sheet/Sheet', () => {
  const {View, Button, ScrollView} = require('react-native');
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
    <ScrollView testID="sheet-scroll-view">{children}</ScrollView>
  );
  MockSheet.Actions = ({children}) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock PalGenerationSettingsSheet
jest.mock('../../PalGenerationSettingsSheet', () => ({
  PalGenerationSettingsSheet: ({isVisible, onClose}) => {
    const {View, Button} = require('react-native');
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="pal-generation-settings-sheet">
        <Button
          title="Close Settings"
          onPress={onClose}
          testID="close-settings-button"
        />
      </View>
    );
  },
}));

// Mock useStructuredOutput hook
jest.mock('../../../hooks/useStructuredOutput', () => ({
  useStructuredOutput: jest.fn(() => ({
    generate: jest.fn(),
    isGenerating: false,
  })),
}));

// Import the mocked palStore (already mocked globally in jest/setup.ts)
import {palStore} from '../../../store';

describe('PalSheet', () => {
  const mockOnClose = jest.fn();

  const createBasicPal = (overrides: Partial<Pal> = {}): Partial<Pal> => ({
    name: '',
    description: '',
    systemPrompt: '',
    useAIPrompt: false,
    isSystemPromptChanged: false,
    parameters: {},
    parameterSchema: [],
    type: 'local',
    source: 'local',
    capabilities: {},
    ...overrides,
  });

  const createExistingPal = (overrides: Partial<Pal> = {}): Partial<Pal> => ({
    id: 'test-pal-id',
    name: 'Test Pal',
    description: 'Test Description',
    systemPrompt: 'You are a helpful assistant',
    useAIPrompt: false,
    isSystemPromptChanged: false,
    defaultModel: modelsList[0],
    color: ['#FF5733', '#C70039'] as [string, string],
    parameters: {},
    parameterSchema: [],
    type: 'local',
    source: 'local',
    capabilities: {},
    ...overrides,
  });

  // Helper function to render PalSheet with required providers
  const renderPalSheet = (pal: Partial<Pal>, isVisible = true) => {
    return render(
      <L10nContext.Provider value={l10n.en}>
        <PalSheet isVisible={isVisible} onClose={mockOnClose} pal={pal} />
      </L10nContext.Provider>,
      {withNavigation: true, withBottomSheetProvider: true},
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders correctly when visible for new pal', () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      expect(getByTestId('sheet')).toBeTruthy();
      // Title is rendered in the mocked Sheet component
      expect(getByTestId('sheet-title')).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const {queryByTestId} = renderPalSheet(createBasicPal(), false);

      expect(queryByTestId('sheet')).toBeNull();
    });

    it('renders with correct title for editing existing pal', () => {
      const {getByTestId} = renderPalSheet(createExistingPal());

      expect(getByTestId('sheet-title')).toBeTruthy();
    });

    it('renders with correct title for new video pal', () => {
      const {getByTestId} = renderPalSheet(
        createBasicPal({capabilities: {video: true}}),
      );

      expect(getByTestId('sheet-title')).toBeTruthy();
    });

    it('renders all basic form fields', () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      expect(getByTestId('form-field-name')).toBeTruthy();
      expect(getByTestId('form-field-description')).toBeTruthy();
    });

    it('renders model selector', () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      expect(getByTestId('pal-default-model-selector')).toBeTruthy();
    });

    it('renders action buttons', () => {
      const {getByText} = renderPalSheet(createBasicPal());

      expect(getByText('Cancel')).toBeTruthy();
      expect(getByText('Create')).toBeTruthy();
    });

    it('shows Save button for editing existing pal', () => {
      const {getByText} = renderPalSheet(createExistingPal());

      expect(getByText('Save')).toBeTruthy();
    });

    it('renders generation settings section only for existing pals', () => {
      const {getByText} = renderPalSheet(createExistingPal());

      expect(getByText('Generation Settings')).toBeTruthy();
      expect(getByText('Configure Generation Settings')).toBeTruthy();
    });

    it('does not render generation settings for new pals', () => {
      const {queryByText} = renderPalSheet(createBasicPal());

      expect(queryByText('Generation Settings')).toBeNull();
    });

    it('renders dynamic parameters section when schema is provided', () => {
      const parameterSchema: ParameterDefinition[] = [
        {
          key: 'world',
          type: 'text',
          label: 'World',
          required: true,
        },
      ];

      const {getByText} = renderPalSheet(createBasicPal({parameterSchema}));

      expect(getByText('Parameters')).toBeTruthy();
    });

    it('does not render parameters section when schema is empty', () => {
      const {queryByText} = renderPalSheet(
        createBasicPal({parameterSchema: []}),
      );

      expect(queryByText('Parameters')).toBeNull();
    });
  });

  describe('Form Initialization', () => {
    it('initializes form with empty values for new pal', () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      const nameInput = getByTestId('form-field-name');
      const descriptionInput = getByTestId('form-field-description');

      expect(nameInput.props.value).toBe('');
      expect(descriptionInput.props.value).toBe('');
    });

    it('initializes form with existing pal data', () => {
      const {getByTestId} = renderPalSheet(createExistingPal());

      const nameInput = getByTestId('form-field-name');
      const descriptionInput = getByTestId('form-field-description');

      expect(nameInput.props.value).toBe('Test Pal');
      expect(descriptionInput.props.value).toBe('Test Description');
    });

    it('initializes form with dynamic parameter values', () => {
      const parameterSchema: ParameterDefinition[] = [
        {
          key: 'world',
          type: 'text',
          label: 'World',
          required: true,
        },
      ];

      const {getByTestId} = renderPalSheet(
        createExistingPal({
          parameterSchema,
          parameters: {world: 'Fantasy Kingdom'},
        }),
      );

      const worldInput = getByTestId('dynamic-field-world');
      expect(worldInput.props.value).toBe('Fantasy Kingdom');
    });
  });

  describe('User Interactions', () => {
    it('calls onClose when Cancel button is pressed', () => {
      const {getByText} = renderPalSheet(createBasicPal());

      fireEvent.press(getByText('Cancel'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('updates form values when user types', () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'My New Pal');

      expect(nameInput.props.value).toBe('My New Pal');
    });

    it('opens generation settings sheet when button is pressed', () => {
      const {getByText, getByTestId} = renderPalSheet(createExistingPal());

      fireEvent.press(getByText('Configure Generation Settings'));
      expect(getByTestId('pal-generation-settings-sheet')).toBeTruthy();
    });

    it('closes generation settings sheet when close button is pressed', () => {
      const {getByText, getByTestId, queryByTestId} = renderPalSheet(
        createExistingPal(),
      );

      // Open the settings sheet
      fireEvent.press(getByText('Configure Generation Settings'));
      expect(getByTestId('pal-generation-settings-sheet')).toBeTruthy();

      // Close the settings sheet
      fireEvent.press(getByTestId('close-settings-button'));
      expect(queryByTestId('pal-generation-settings-sheet')).toBeNull();
    });
  });

  describe('Form Validation', () => {
    it('shows validation error when name is empty', async () => {
      const {getByText} = renderPalSheet(createBasicPal());

      // Try to submit without entering a name
      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(getByText('Name is required')).toBeTruthy();
      });
    });

    it('does not show validation error when name is provided', async () => {
      const {getByText, getByTestId, queryByText} = renderPalSheet(
        createBasicPal(),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'My New Pal');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(queryByText('Name is required')).toBeNull();
      });
    });
  });

  describe('Form Submission - Create New Pal', () => {
    it('creates a new pal with basic information', async () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      // Wait for form to be initialized
      await waitFor(() => {
        const nameInput = getByTestId('form-field-name');
        expect(nameInput.props.value).toBe('');
      });

      const nameInput = getByTestId('form-field-name');
      const descriptionInput = getByTestId('form-field-description');

      await act(async () => {
        fireEvent.changeText(nameInput, 'My New Pal');
        fireEvent.changeText(descriptionInput, 'A helpful assistant');
      });

      // Wait for form state to update
      await waitFor(() => {
        expect(nameInput.props.value).toBe('My New Pal');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'My New Pal',
            description: 'A helpful assistant',
          }),
        );
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('creates a new pal with all fields filled', async () => {
      const {getByText, getByTestId} = renderPalSheet(createBasicPal());

      const nameInput = getByTestId('form-field-name');
      const descriptionInput = getByTestId('form-field-description');

      fireEvent.changeText(nameInput, 'Complete Pal');
      fireEvent.changeText(descriptionInput, 'A complete pal with all fields');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('creates a new pal with dynamic parameters', async () => {
      const parameterSchema: ParameterDefinition[] = [
        {
          key: 'world',
          type: 'text',
          label: 'World',
          required: true,
        },
      ];

      const {getByText, getByTestId} = renderPalSheet(
        createBasicPal({parameterSchema}),
      );

      const nameInput = getByTestId('form-field-name');
      const worldInput = getByTestId('dynamic-field-world');

      fireEvent.changeText(nameInput, 'Story Pal');
      fireEvent.changeText(worldInput, 'Fantasy Kingdom');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Story Pal',
            parameters: {world: 'Fantasy Kingdom'},
          }),
        );
      });
    });
  });

  describe('Form Submission - Update Existing Pal', () => {
    it('updates an existing pal with modified data', async () => {
      const {getByText, getByTestId} = renderPalSheet(createExistingPal());

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Updated Pal Name');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            name: 'Updated Pal Name',
          }),
        );
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('preserves existing properties when updating', async () => {
      const {getByText, getByTestId} = renderPalSheet(createExistingPal());

      const descriptionInput = getByTestId('form-field-description');
      fireEvent.changeText(descriptionInput, 'Updated Description');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            name: 'Test Pal',
            description: 'Updated Description',
          }),
        );
      });
    });

    it('updates dynamic parameters', async () => {
      const parameterSchema: ParameterDefinition[] = [
        {
          key: 'world',
          type: 'text',
          label: 'World',
          required: true,
        },
      ];

      const {getByText, getByTestId} = renderPalSheet(
        createExistingPal({
          parameterSchema,
          parameters: {world: 'Old World'},
        }),
      );

      const worldInput = getByTestId('dynamic-field-world');
      fireEvent.changeText(worldInput, 'New World');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            parameters: {world: 'New World'},
          }),
        );
      });
    });
  });

  describe('Loading and Saving States', () => {
    it('disables submit button while saving', async () => {
      // Mock createPal to return a promise that we can control
      let resolveCreate: (value: any) => void;
      const createPromise = new Promise(resolve => {
        resolveCreate = resolve;
      });
      (palStore.createPal as jest.Mock).mockReturnValue(createPromise);

      const {getByTestId} = renderPalSheet(createBasicPal());

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Test Pal');

      const createButton = getByTestId('submit-button');
      fireEvent.press(createButton);

      // Button should be disabled while saving
      await waitFor(() => {
        expect(createButton.props.accessibilityState?.disabled).toBe(true);
      });

      // Resolve the promise
      resolveCreate!({id: 'new-pal-id'});

      // Button should be enabled again after saving
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('handles failed save gracefully', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (palStore.createPal as jest.Mock).mockRejectedValue(
        new Error('Save failed'),
      );

      const {getByText, getByTestId} = renderPalSheet(createBasicPal());

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Test Pal');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error saving pal:',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('logs error when update fails', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      (palStore.updatePal as jest.Mock).mockRejectedValue(
        new Error('Update failed'),
      );

      const {getByText, getByTestId} = renderPalSheet(createExistingPal());

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Updated Name');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error saving pal:',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Form Reset', () => {
    it('resets form when sheet is closed and reopened', () => {
      const {getByTestId, rerender} = renderPalSheet(createBasicPal());

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Temporary Name');

      expect(nameInput.props.value).toBe('Temporary Name');

      // Close the sheet
      rerender(
        <L10nContext.Provider value={l10n.en}>
          <PalSheet
            isVisible={false}
            onClose={mockOnClose}
            pal={createBasicPal()}
          />
        </L10nContext.Provider>,
      );

      // Reopen the sheet
      rerender(
        <L10nContext.Provider value={l10n.en}>
          <PalSheet
            isVisible={true}
            onClose={mockOnClose}
            pal={createBasicPal()}
          />
        </L10nContext.Provider>,
      );

      const newNameInput = getByTestId('form-field-name');
      expect(newNameInput.props.value).toBe('');
    });
  });

  describe('Different Pal Types', () => {
    it('handles video pal creation', async () => {
      const {getByText, getByTestId} = renderPalSheet(
        createBasicPal({capabilities: {video: true}}),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Video Pal');

      fireEvent.press(getByText('Create'));

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Video Pal',
            capabilities: {video: true},
          }),
        );
      });
    });

    it('handles palshub pal editing', async () => {
      const {getByText, getByTestId} = renderPalSheet(
        createExistingPal({
          source: 'palshub',
          palshub_id: 'palshub-123',
        }),
      );

      const nameInput = getByTestId('form-field-name');
      fireEvent.changeText(nameInput, 'Updated PalsHub Pal');

      fireEvent.press(getByText('Save'));

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            name: 'Updated PalsHub Pal',
            source: 'palshub',
          }),
        );
      });
    });
  });

  describe('Completion Settings', () => {
    it('includes completion settings when updating existing pal', async () => {
      const completionSettings = {
        temperature: 0.8,
        top_p: 0.95,
        max_tokens: 1024,
      };

      const {getByText, getByTestId} = renderPalSheet(
        createExistingPal({completionSettings}),
      );

      // Wait for form to be initialized with the pal's data
      await waitFor(() => {
        const nameInput = getByTestId('form-field-name');
        expect(nameInput.props.value).toBe('Test Pal');
      });

      const nameInput = getByTestId('form-field-name');

      await act(async () => {
        fireEvent.changeText(nameInput, 'Updated Pal');
      });

      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            completionSettings,
          }),
        );
      });
    });
  });
});
