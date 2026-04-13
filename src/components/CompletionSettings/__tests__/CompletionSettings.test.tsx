import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {CompletionSettings} from '../CompletionSettings';
import {mockCompletionParams} from '../../../../jest/fixtures/models';

jest.useFakeTimers();

describe('CompletionSettings', () => {
  it('renders all settings correctly', async () => {
    const {getByDisplayValue, getByTestId} = render(
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

    expect(getByTestId('seed-input')).toBeTruthy();
    const seedInput = getByTestId('seed-input');
    expect(seedInput.props.value).toBe('0');
  });

  it('handles slider changes', async () => {
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

    // advance timers for debounce delay
    jest.advanceTimersByTime(300);
    expect(mockOnChange).toHaveBeenCalledWith('temperature', 0.8);
    jest.useRealTimers();
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
    expect(mockOnChange).toHaveBeenCalledWith('n_predict', '1024');
  });

  it('shows unlimited toggle on when n_predict is -1', () => {
    const {getByTestId, queryByTestId} = render(
      <CompletionSettings
        settings={{...mockCompletionParams, n_predict: -1}}
        onChange={jest.fn()}
      />,
    );

    const toggle = getByTestId('n_predict-unlimited-toggle');
    expect(toggle.props.value).toBe(true);
    expect(getByTestId('n_predict-unlimited-label')).toBeTruthy();
    expect(queryByTestId('n_predict-input')).toBeNull();
  });

  it('shows text input when unlimited toggle is off', () => {
    const {getByTestId, queryByTestId} = render(
      <CompletionSettings
        settings={{...mockCompletionParams, n_predict: 500}}
        onChange={jest.fn()}
      />,
    );

    const toggle = getByTestId('n_predict-unlimited-toggle');
    expect(toggle.props.value).toBe(false);
    expect(getByTestId('n_predict-input')).toBeTruthy();
    expect(queryByTestId('n_predict-unlimited-label')).toBeNull();
  });

  it('toggles n_predict between -1 and 1024', () => {
    const mockOnChange = jest.fn();
    const {getByTestId} = render(
      <CompletionSettings
        settings={{...mockCompletionParams, n_predict: 500}}
        onChange={mockOnChange}
      />,
    );

    // Toggle on → should set to -1
    const toggle = getByTestId('n_predict-unlimited-toggle');
    fireEvent(toggle, 'valueChange', true);
    expect(mockOnChange).toHaveBeenCalledWith('n_predict', -1);

    // Toggle off → should set to 1024
    mockOnChange.mockClear();
    fireEvent(toggle, 'valueChange', false);
    expect(mockOnChange).toHaveBeenCalledWith('n_predict', 1024);
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
});
