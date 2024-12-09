import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {CompletionSettings} from '../CompletionSettings';
import {mockCompletionParams} from '../../../../../jest/fixtures/models';

jest.useFakeTimers();

describe('CompletionSettings', () => {
  it('renders all settings correctly', async () => {
    const {getByDisplayValue, getByTestId, getByText} = render(
      <CompletionSettings
        settings={{...mockCompletionParams, mirostat: 1}}
        onChange={jest.fn()}
      />,
    );

    expect(getByTestId('n_predict-input')).toBeTruthy();
    expect(getByDisplayValue('500')).toBeTruthy();

    expect(getByTestId('temperature-slider')).toBeTruthy();
    const temperatureSlider = getByTestId('temperature-slider');
    expect(temperatureSlider.props.value).toBe(0.01);

    expect(getByTestId('top_k-slider')).toBeTruthy();
    const topKSlider = getByTestId('top_k-slider');
    expect(topKSlider.props.value).toBe(40);

    expect(getByTestId('top_p-slider')).toBeTruthy();
    const topPSlider = getByTestId('top_p-slider');
    expect(topPSlider.props.value).toBe(0.95);

    expect(getByTestId('min_p-slider')).toBeTruthy();
    const minPSlider = getByTestId('min_p-slider');
    expect(minPSlider.props.value).toBe(0.05);

    expect(getByTestId('xtc_threshold-slider')).toBeTruthy();
    const xtcThresholdSlider = getByTestId('xtc_threshold-slider');
    expect(xtcThresholdSlider.props.value).toBe(0.1);

    expect(getByTestId('xtc_probability-slider')).toBeTruthy();
    const xtcProbabilitySlider = getByTestId('xtc_probability-slider');
    expect(xtcProbabilitySlider.props.value).toBe(0.01);

    expect(getByTestId('typical_p-slider')).toBeTruthy();
    const typicalPSlider = getByTestId('typical_p-slider');
    expect(typicalPSlider.props.value).toBe(1);

    expect(getByTestId('penalty_last_n-slider')).toBeTruthy();
    const penaltyLastNSlider = getByTestId('penalty_last_n-slider');
    expect(penaltyLastNSlider.props.value).toBe(64);

    expect(getByTestId('penalty_repeat-slider')).toBeTruthy();
    const penaltyRepeatSlider = getByTestId('penalty_repeat-slider');
    expect(penaltyRepeatSlider.props.value).toBe(1.0);

    expect(getByTestId('penalty_freq-slider')).toBeTruthy();
    const penaltyFreqSlider = getByTestId('penalty_freq-slider');
    expect(penaltyFreqSlider.props.value).toBe(0.5);

    expect(getByTestId('penalty_present-slider')).toBeTruthy();
    const penaltyPresentSlider = getByTestId('penalty_present-slider');
    expect(penaltyPresentSlider.props.value).toBe(0.4);

    expect(getByTestId('mirostat_tau-slider')).toBeTruthy();
    const mirostatTauSlider = getByTestId('mirostat_tau-slider');
    expect(mirostatTauSlider.props.value).toBe(5);

    expect(getByTestId('mirostat_eta-slider')).toBeTruthy();
    const mirostatEtaSlider = getByTestId('mirostat_eta-slider');
    expect(mirostatEtaSlider.props.value).toBe(0.1);

    expect(getByTestId('penalize_nl-switch')).toBeTruthy();
    const penalizeNlSwitch = getByTestId('penalize_nl-switch');
    expect(penalizeNlSwitch.props.value).toBe(false);

    expect(getByTestId('seed-input')).toBeTruthy();
    const seedInput = getByTestId('seed-input');
    expect(seedInput.props.value).toBe('0');

    expect(getByTestId('n_probs-input')).toBeTruthy();
    const nProbsInput = getByTestId('n_probs-input');
    expect(nProbsInput.props.value).toBe('0');

    expect(getByTestId('stop-input')).toBeTruthy();
    expect(getByText('<stop1>')).toBeTruthy();
    expect(getByText('<stop2>')).toBeTruthy();
  });

  it('handles slider changes', () => {
    const mockOnChange = jest.fn();
    const {getByTestId} = render(
      <CompletionSettings
        settings={mockCompletionParams}
        onChange={mockOnChange}
      />,
    );

    const temperatureSlider = getByTestId('temperature-slider');

    fireEvent(temperatureSlider, 'valueChange', 0.8);
    fireEvent(temperatureSlider, 'slidingComplete', 0.8);

    expect(mockOnChange).toHaveBeenCalledWith('temperature', 0.8);
  });

  it('handles text input changes', () => {
    const mockOnChange = jest.fn();
    const {getByTestId} = render(
      <CompletionSettings
        settings={mockCompletionParams}
        onChange={mockOnChange}
      />,
    );

    const nPredictInput = getByTestId('n_predict-input');
    fireEvent.changeText(nPredictInput, '1024');
    expect(mockOnChange).toHaveBeenCalledWith('n_predict', 1024);
  });

  it('handles switch toggle', () => {
    const mockOnChange = jest.fn();
    const {getByTestId} = render(
      <CompletionSettings
        settings={mockCompletionParams}
        onChange={mockOnChange}
      />,
    );

    const penalizeNlSwitch = getByTestId('penalize_nl-switch');
    fireEvent(penalizeNlSwitch, 'valueChange', false);
    expect(mockOnChange).toHaveBeenCalledWith('penalize_nl', false);
  });

  it('handles chip selection', () => {
    const mockOnChange = jest.fn();
    const {getByText} = render(
      <CompletionSettings
        settings={mockCompletionParams}
        onChange={mockOnChange}
      />,
    );

    const mirostatV2Button = getByText('v2');
    fireEvent.press(mirostatV2Button);
    expect(mockOnChange).toHaveBeenCalledWith('mirostat', 2);
  });

  it('handles stop words additions and removals', () => {
    const mockOnChange = jest.fn();
    const {getByTestId, getAllByRole} = render(
      <CompletionSettings
        settings={mockCompletionParams}
        onChange={mockOnChange}
      />,
    );

    // Test adding new stop word
    const stopInput = getByTestId('stop-input');
    fireEvent.changeText(stopInput, 'newstop');
    fireEvent(stopInput, 'submitEditing');

    expect(mockOnChange).toHaveBeenCalledWith('stop', [
      ...(mockCompletionParams.stop ?? []),
      'newstop',
    ]);

    // Test removing stop word
    const closeButtons = getAllByRole('button', {name: /close/i});
    fireEvent.press(closeButtons[0]);

    expect(mockOnChange).toHaveBeenCalledWith(
      'stop',
      (mockCompletionParams.stop ?? []).filter(word => word !== '<stop1>'),
    );
  });
});
