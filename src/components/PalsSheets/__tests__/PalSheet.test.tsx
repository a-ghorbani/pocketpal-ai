import React from 'react';
import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {PalSheet} from '../PalSheet';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';
import type {Pal} from '../../../types/pal';
import {modelsList} from '../../../../jest/fixtures/models';
import type {ParameterDefinition} from '../../../types/pal';
import {ROLEPLAY_SCHEMA, VIDEO_SCHEMA} from '../../../types/pal';

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

// Mock useStructuredOutput hook
jest.mock('../../../hooks/useStructuredOutput', () => ({
  useStructuredOutput: jest.fn(() => ({
    generate: jest.fn(),
    isGenerating: false,
  })),
}));

// Import the mocked palStore (already mocked globally in jest/setup.ts)
import {palStore} from '../../../store';

import {
  talentRegistry,
  registerDefaultTalents,
  resetRegisteredFlag,
} from '../../../services/talents';

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

    it('renders the General and Generation tabs', () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      expect(getByTestId('ui-tab-item-general')).toBeTruthy();
      expect(getByTestId('ui-tab-item-generation')).toBeTruthy();
      // General tab content mounts by default.
      expect(getByTestId('pal-form-tab-general')).toBeTruthy();
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

    it('switches to the Generation tab and back to General', async () => {
      const {getByTestId, queryByTestId} = renderPalSheet(createExistingPal());

      // General is mounted by default.
      expect(getByTestId('pal-form-tab-general')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('ui-tab-item-generation'));
      });

      await waitFor(() => {
        expect(getByTestId('pal-form-tab-generation')).toBeTruthy();
        expect(queryByTestId('pal-form-tab-general')).toBeNull();
      });

      await act(async () => {
        fireEvent.press(getByTestId('ui-tab-item-general'));
      });

      await waitFor(() => {
        expect(getByTestId('pal-form-tab-general')).toBeTruthy();
        expect(queryByTestId('pal-form-tab-generation')).toBeNull();
      });
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
      const {getByText, getByTestId, queryByText} =
        renderPalSheet(createBasicPal());

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

  describe('Generation tab', () => {
    it('renders the inherited-settings indicator on the Generation tab', async () => {
      const {getByTestId, getByText} = renderPalSheet(createExistingPal());

      await act(async () => {
        fireEvent.press(getByTestId('ui-tab-item-generation'));
      });

      await waitFor(() => {
        // Inherited copy renders when the pal has no custom settings.
        expect(getByText(/Inherited settings for/i)).toBeTruthy();
        expect(getByTestId('generation-reset-button')).toBeTruthy();
      });
    });

    it('persists reset-to-system completionSettings via the single updatePal path', async () => {
      const {getByTestId, getByText} = renderPalSheet(createExistingPal());

      await act(async () => {
        fireEvent.press(getByTestId('ui-tab-item-generation'));
      });

      // Open the Reset menu and pick "Reset to System Defaults".
      await act(async () => {
        fireEvent.press(getByTestId('generation-reset-button'));
      });
      await act(async () => {
        fireEvent.press(getByText('Reset to System Defaults'));
      });

      // Save through the form footer (single writer).
      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            completionSettings: expect.objectContaining({
              temperature: expect.anything(),
            }),
          }),
        );
      });
    });
  });

  describe('Schema-driven fields (General tab)', () => {
    it('renders Capture Interval for a video pal from its parameter schema', () => {
      const {getByTestId} = renderPalSheet(
        createBasicPal({
          capabilities: {video: true},
          parameterSchema: VIDEO_SCHEMA,
        }),
      );

      expect(getByTestId('dynamic-field-captureInterval')).toBeTruthy();
    });

    it('omits Capture Interval for a non-video pal (no schema field)', () => {
      const {queryByTestId} = renderPalSheet(
        createBasicPal({parameterSchema: []}),
      );

      expect(queryByTestId('dynamic-field-captureInterval')).toBeNull();
    });

    it('renders World and Location for a roleplay pal from ROLEPLAY_SCHEMA', () => {
      const {getByTestId} = renderPalSheet(
        createBasicPal({parameterSchema: ROLEPLAY_SCHEMA}),
      );

      expect(getByTestId('dynamic-field-world')).toBeTruthy();
      expect(getByTestId('dynamic-field-location')).toBeTruthy();
    });

    it('creates a roleplay pal persisting World/Location via createPal', async () => {
      const {getByTestId} = renderPalSheet(
        createBasicPal({parameterSchema: ROLEPLAY_SCHEMA}),
      );

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-name'), 'Roleplay Pal');
        fireEvent.changeText(getByTestId('dynamic-field-world'), 'Eldoria');
        fireEvent.changeText(
          getByTestId('dynamic-field-location'),
          'Throne room',
        );
        fireEvent.changeText(getByTestId('dynamic-field-aiRole'), 'Wizard');
        fireEvent.changeText(getByTestId('dynamic-field-userRole'), 'Knight');
        fireEvent.changeText(getByTestId('dynamic-field-situation'), 'A quest');
        fireEvent.changeText(getByTestId('dynamic-field-toneStyle'), 'Formal');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Roleplay Pal',
            parameters: expect.objectContaining({
              world: 'Eldoria',
              location: 'Throne room',
            }),
          }),
        );
      });
    });
  });

  describe('Talent Integration', () => {
    beforeEach(() => {
      // Ensure talents are registered for integration tests
      talentRegistry.reset();
      resetRegisteredFlag();
      registerDefaultTalents();
    });

    afterAll(() => {
      talentRegistry.reset();
      resetRegisteredFlag();
    });

    it('renders talent section in PalSheet', () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      expect(getByTestId('talent-section')).toBeTruthy();
    });

    it('creates a pal with talents selected and correct pact', async () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      // Fill required name field
      const nameInput = getByTestId('form-field-name');
      await act(async () => {
        fireEvent.changeText(nameInput, 'Pal With Talents');
      });

      // Toggle calculate and datetime talents on
      await act(async () => {
        fireEvent(getByTestId('talent-switch-calculate'), 'valueChange', true);
      });
      await act(async () => {
        fireEvent(getByTestId('talent-switch-datetime'), 'valueChange', true);
      });

      // Submit the form
      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Pal With Talents',
            pact: {
              talents: expect.arrayContaining([
                {name: 'calculate', necessity: 'required'},
                {name: 'datetime', necessity: 'required'},
              ]),
            },
          }),
        );
      });
    });

    it('edits a pal with existing pact.talents and pre-selects switches', () => {
      const {getByTestId} = renderPalSheet(
        createExistingPal({
          pact: {
            talents: [
              {name: 'render_html', necessity: 'required'},
              {name: 'calculate', necessity: 'required'},
            ],
          },
        }),
      );

      // render_html and calculate should be on
      expect(getByTestId('talent-switch-render_html').props.value).toBe(true);
      expect(getByTestId('talent-switch-calculate').props.value).toBe(true);

      // datetime should be off
      expect(getByTestId('talent-switch-datetime').props.value).toBe(false);
    });

    it('removing all talents results in pact with empty talents array', async () => {
      const {getByTestId, getByText} = renderPalSheet(
        createExistingPal({
          pact: {
            talents: [{name: 'calculate', necessity: 'required'}],
          },
        }),
      );

      // Verify calculate is initially on
      expect(getByTestId('talent-switch-calculate').props.value).toBe(true);

      // Toggle calculate off
      await act(async () => {
        fireEvent(getByTestId('talent-switch-calculate'), 'valueChange', false);
      });

      // Submit the form
      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            pact: {talents: []},
          }),
        );
      });
    });

    it('creates a pal with no talents selected and pact has empty talents', async () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      const nameInput = getByTestId('form-field-name');
      await act(async () => {
        fireEvent.changeText(nameInput, 'No Talents Pal');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'No Talents Pal',
            pact: {talents: []},
          }),
        );
      });
    });
  });

  describe('Greeting save predicate', () => {
    it('creates a pal with greeting text and two suggested prompts', async () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      const nameInput = getByTestId('form-field-name');
      await act(async () => {
        fireEvent.changeText(nameInput, 'Friendly Greeter');
      });

      const greetingInput = getByTestId('form-field-greetingText');
      await act(async () => {
        fireEvent.changeText(greetingInput, 'Hi! What can I help with today?');
      });

      // Add two prompt rows and fill each.
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(
          getByTestId('suggested-prompt-input-0'),
          'Summarize a webpage',
        );
      });
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(
          getByTestId('suggested-prompt-input-1'),
          'Brainstorm a name',
        );
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Friendly Greeter',
            greeting: {
              text: 'Hi! What can I help with today?',
              suggestedPrompts: ['Summarize a webpage', 'Brainstorm a name'],
            },
          }),
        );
      });
    });

    it('clears greeting on save by writing the empty-object sentinel', async () => {
      const {getByTestId, getByText} = renderPalSheet(
        createExistingPal({
          greeting: {
            text: 'Old greeting',
            suggestedPrompts: ['Old prompt'],
          },
        }),
      );

      // Form seeds with existing values.
      await waitFor(() => {
        expect(getByTestId('form-field-greetingText').props.value).toBe(
          'Old greeting',
        );
        expect(getByTestId('suggested-prompt-input-0').props.value).toBe(
          'Old prompt',
        );
      });

      // Clear the greeting text.
      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-greetingText'), '');
      });

      // Remove the only prompt row.
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-remove-0'));
      });

      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            greeting: {text: '', suggestedPrompts: []},
          }),
        );
      });
    });

    it('emits greeting with raw whitespace text when prompts are present', async () => {
      // Whitespace-only text has length > 0, so the predicate is true and the
      // text is saved verbatim (no trim) — mirror of the PalsHub wire-side
      // predicate.
      const {getByTestId} = renderPalSheet(createBasicPal());

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-name'), 'Whitespace Pal');
      });

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-greetingText'), '   ');
      });

      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(
          getByTestId('suggested-prompt-input-0'),
          'Tell me a joke',
        );
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            greeting: {
              text: '   ',
              suggestedPrompts: ['Tell me a joke'],
            },
          }),
        );
      });
    });

    it('emits greeting with empty text when only prompts are filled', async () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-name'), 'Prompts Only');
      });

      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(getByTestId('suggested-prompt-input-0'), 'Hello');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            greeting: {
              text: '',
              suggestedPrompts: ['Hello'],
            },
          }),
        );
      });
    });

    it('writes the sentinel when editing a greetingless pal and leaving fields blank', async () => {
      // No-op symmetry case: a pal with no greeting today, no greeting edits
      // made, still saves with the sentinel. Observable behaviour: nothing.
      const {getByTestId, getByText} = renderPalSheet(createExistingPal());

      await act(async () => {
        fireEvent.changeText(
          getByTestId('form-field-description'),
          'Updated description only',
        );
      });

      await act(async () => {
        fireEvent.press(getByText('Save'));
      });

      await waitFor(() => {
        expect(palStore.updatePal).toHaveBeenCalledWith(
          'test-pal-id',
          expect.objectContaining({
            description: 'Updated description only',
            greeting: {text: '', suggestedPrompts: []},
          }),
        );
      });
    });

    it('seeds editor fields from an existing pal greeting on open', () => {
      const {getByTestId} = renderPalSheet(
        createExistingPal({
          greeting: {
            text: 'Hello',
            suggestedPrompts: ['x', 'y'],
          },
        }),
      );

      expect(getByTestId('form-field-greetingText').props.value).toBe('Hello');
      expect(getByTestId('suggested-prompt-input-0').props.value).toBe('x');
      expect(getByTestId('suggested-prompt-input-1').props.value).toBe('y');
    });

    it('trims each prompt and drops empty rows before saving', async () => {
      const {getByTestId} = renderPalSheet(createBasicPal());

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-name'), 'Trim Pal');
      });

      await act(async () => {
        fireEvent.changeText(getByTestId('form-field-greetingText'), 'Hi');
      });

      // Row 0: '  a  ' (whitespace around content — should be trimmed to 'a')
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(getByTestId('suggested-prompt-input-0'), '  a  ');
      });

      // Row 1: '' (empty — should be dropped)
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });

      // Row 2: '   ' (whitespace-only — should be dropped)
      await act(async () => {
        fireEvent.press(getByTestId('suggested-prompt-add-button'));
      });
      await act(async () => {
        fireEvent.changeText(getByTestId('suggested-prompt-input-2'), '   ');
      });

      await act(async () => {
        fireEvent.press(getByTestId('submit-button'));
      });

      await waitFor(() => {
        expect(palStore.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            greeting: {
              text: 'Hi',
              suggestedPrompts: ['a'],
            },
          }),
        );
      });
    });
  });
});
