import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';

import {PalGenerationSettingsSheet} from '../PalGenerationSettingsSheet';
import {chatSessionStore, defaultCompletionSettings} from '../../../store';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../utils/l10n';
import {validateCompletionSettings} from '../../../utils/modelSettings';
import {mockCompletionParams} from '../../../../jest/fixtures/models';

jest.useFakeTimers();

// Mock Sheet component
jest.mock('../../Sheet/Sheet', () => {
  const {View, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}: any) => {
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
  MockSheet.ScrollView = ({children}: any) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  MockSheet.Actions = ({children}: any) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock validation
jest.mock('../../../utils/modelSettings', () => ({
  validateCompletionSettings: jest.fn().mockReturnValue({errors: {}}),
  COMPLETION_PARAMS_METADATA: {
    temperature: {validation: {type: 'numeric'}},
    top_p: {validation: {type: 'numeric'}},
    max_tokens: {validation: {type: 'numeric'}},
  },
}));

jest.spyOn(Alert, 'alert');

describe('PalGenerationSettingsSheet', () => {
  const defaultProps = {
    isVisible: true,
    onClose: jest.fn(),
    palName: 'Test Pal',
    completionSettings: undefined,
    onUpdateSettings: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (validateCompletionSettings as jest.Mock).mockReturnValue({errors: {}});
  });

  describe('Rendering', () => {
    it('renders correctly when visible', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      expect(getByTestId('sheet')).toBeTruthy();
      expect(getByTestId('completion-settings')).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const {queryByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} isVisible={false} />
        </L10nContext.Provider>,
      );

      expect(queryByTestId('sheet')).toBeNull();
    });

    it('displays correct title with pal name', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      const title = getByTestId('sheet-title');
      expect(title.props.children).toContain('Test Pal');
    });

    it('shows inherited settings indicator when no custom settings', () => {
      const {getByText} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      expect(
        getByText(
          l10n.en.components.palGenerationSettingsSheet.inheritedSettingsFor(
            'Test Pal',
          ),
        ),
      ).toBeTruthy();
    });

    it('shows custom settings indicator when custom settings exist', () => {
      const {getByText} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet
            {...defaultProps}
            completionSettings={mockCompletionParams}
          />
        </L10nContext.Provider>,
      );

      expect(
        getByText(
          l10n.en.components.palGenerationSettingsSheet.customSettingsFor(
            'Test Pal',
          ),
        ),
      ).toBeTruthy();
    });
  });

  describe('Settings Modification', () => {
    it('allows changing settings via slider', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      const temperatureSlider = getByTestId('temperature-slider');

      // Simulate slider change
      act(() => {
        fireEvent(temperatureSlider, 'valueChange', 0.9);
      });

      // Advance timers to handle debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Check that the input field reflects the new value
      const temperatureInput = getByTestId('temperature-slider-input');
      expect(temperatureInput.props.value).toBe('0.9');
    });

    it('initializes with provided completion settings', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet
            {...defaultProps}
            completionSettings={mockCompletionParams}
          />
        </L10nContext.Provider>,
      );

      const temperatureSlider = getByTestId('temperature-slider');
      expect(temperatureSlider.props.value).toBe(
        mockCompletionParams.temperature,
      );
    });

    it('initializes with default settings when no custom settings provided', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      const temperatureSlider = getByTestId('temperature-slider');
      expect(temperatureSlider.props.value).toBe(
        defaultCompletionSettings.temperature,
      );
    });
  });

  describe('Save Functionality', () => {
    it('saves settings when save button is pressed', async () => {
      const {getByText, getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      // Change a setting via slider
      const temperatureSlider = getByTestId('temperature-slider');
      act(() => {
        fireEvent(temperatureSlider, 'valueChange', 0.9);
      });

      // Advance timers to handle debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Save
      const saveButton = getByText(l10n.en.common.save);
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            temperature: 0.9,
          }),
        );
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    it('validates settings before saving', async () => {
      const {getByText} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      const saveButton = getByText(l10n.en.common.save);
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(validateCompletionSettings).toHaveBeenCalled();
      });
    });

    it('shows alert when validation fails', async () => {
      (validateCompletionSettings as jest.Mock).mockReturnValue({
        errors: {temperature: 'Invalid temperature'},
      });

      const {getByText} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      const saveButton = getByText(l10n.en.common.save);
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          l10n.en.components.palGenerationSettingsSheet.invalidValues,
          expect.stringContaining('temperature'),
          expect.any(Array),
        );
        expect(defaultProps.onUpdateSettings).not.toHaveBeenCalled();
        expect(defaultProps.onClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('Reset Functionality', () => {
    it('resets to global settings when reset to global is selected', async () => {
      const {getByText} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet
            {...defaultProps}
            completionSettings={mockCompletionParams}
          />
        </L10nContext.Provider>,
      );

      const resetButton = getByText(l10n.en.common.reset);
      fireEvent.press(resetButton);

      const resetToGlobalButton = getByText(
        l10n.en.components.palGenerationSettingsSheet.resetToGlobal,
      );
      fireEvent.press(resetToGlobalButton);

      await waitFor(() => {
        expect(chatSessionStore.resolveCompletionSettings).toHaveBeenCalled();
      });
    });

    it('resets to system defaults when reset to system is selected', () => {
      const {getByText, getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet
            {...defaultProps}
            completionSettings={mockCompletionParams}
          />
        </L10nContext.Provider>,
      );

      const resetButton = getByText(l10n.en.common.reset);
      fireEvent.press(resetButton);

      const resetToSystemButton = getByText(
        l10n.en.components.palGenerationSettingsSheet.resetToSystem,
      );
      fireEvent.press(resetToSystemButton);

      const temperatureSlider = getByTestId('temperature-slider');
      expect(temperatureSlider.props.value).toBe(
        defaultCompletionSettings.temperature,
      );
    });

    it('clears pal-specific settings when reset to default is selected', () => {
      const {getByText} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet
            {...defaultProps}
            completionSettings={mockCompletionParams}
          />
        </L10nContext.Provider>,
      );

      const resetButton = getByText(l10n.en.common.reset);
      fireEvent.press(resetButton);

      const clearButton = getByText(
        l10n.en.components.palGenerationSettingsSheet.clearPalSettings,
      );
      fireEvent.press(clearButton);

      expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Close Behavior', () => {
    it('resets to original settings when closed without saving', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet
            {...defaultProps}
            completionSettings={mockCompletionParams}
          />
        </L10nContext.Provider>,
      );

      // Change a setting via slider
      const temperatureSlider = getByTestId('temperature-slider');
      act(() => {
        fireEvent(temperatureSlider, 'valueChange', 0.9);
      });

      // Advance timers to handle debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Verify it changed
      const temperatureInput = getByTestId('temperature-slider-input');
      expect(temperatureInput.props.value).toBe('0.9');

      // Close without saving
      const closeButton = getByTestId('sheet-close-button');
      fireEvent.press(closeButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
      expect(defaultProps.onUpdateSettings).not.toHaveBeenCalled();
    });

    it('calls onClose when sheet is closed', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet {...defaultProps} />
        </L10nContext.Provider>,
      );

      const closeButton = getByTestId('sheet-close-button');
      fireEvent.press(closeButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Settings Update on Props Change', () => {
    it('updates settings when completionSettings prop changes', () => {
      const customSettings1 = {...mockCompletionParams, temperature: 0.7};
      const customSettings2 = {...mockCompletionParams, temperature: 0.9};

      const {rerender, getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet
            {...defaultProps}
            completionSettings={customSettings1}
          />
        </L10nContext.Provider>,
      );

      let temperatureSlider = getByTestId('temperature-slider');
      expect(temperatureSlider.props.value).toBe(0.7);

      // Update props
      rerender(
        <L10nContext.Provider value={l10n.en}>
          <PalGenerationSettingsSheet
            {...defaultProps}
            completionSettings={customSettings2}
          />
        </L10nContext.Provider>,
      );

      temperatureSlider = getByTestId('temperature-slider');
      expect(temperatureSlider.props.value).toBe(0.9);
    });
  });
});
