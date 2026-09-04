import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {CompletionSettings} from '../CompletionSettings';
import {mockCompletionParams} from '../../../../jest/fixtures/models';
import {propsModelDescribing} from '../../../../jest/fixtures/llamaServerWire';

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

  it('gives each slider the granularity its parameter metadata declares', () => {
    const {getByTestId} = render(
      <CompletionSettings
        settings={{...mockCompletionParams, mirostat: 1}}
        onChange={jest.fn()}
      />,
    );

    expect(getByTestId('top_k-slider').props.step).toBe(1);
    expect(getByTestId('penalty_last_n-slider').props.step).toBe(1);
    expect(getByTestId('mirostat_tau-slider').props.step).toBe(1);
    expect(getByTestId('temperature-slider').props.step).toBe(0.01);
  });

  describe('server defaults', () => {
    it('shows nothing at all when the server reported none', () => {
      const {queryByTestId} = render(
        <CompletionSettings
          settings={mockCompletionParams}
          onChange={jest.fn()}
        />,
      );

      expect(queryByTestId('top_k-server-default')).toBeNull();
      expect(queryByTestId('top_k-server-default-reset')).toBeNull();
    });

    it('shows nothing for a parameter the server did not report', () => {
      const {queryByTestId} = render(
        <CompletionSettings
          settings={mockCompletionParams}
          onChange={jest.fn()}
          serverDefaults={{top_k: 40}}
        />,
      );

      expect(queryByTestId('top_k-server-default')).toBeTruthy();
      expect(queryByTestId('min_p-server-default')).toBeNull();
      expect(queryByTestId('min_p-server-default-reset')).toBeNull();
    });

    it('reads a value still on the server default as such', () => {
      const {getByTestId, queryByTestId} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, top_k: 40}}
          onChange={jest.fn()}
          serverDefaults={{top_k: 40}}
        />,
      );

      expect(getByTestId('top_k-server-default')).toBeTruthy();
      expect(queryByTestId('top_k-server-default-reset')).toBeNull();
    });

    it('does not call a quantised float a deliberate change', () => {
      // Half a step either way is the slider's own resolution, not an edit.
      const {getByTestId} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, penalty_repeat: 1.0}}
          onChange={jest.fn()}
          serverDefaults={{penalty_repeat: 1.004}}
        />,
      );

      expect(getByTestId('penalty_repeat-server-default')).toBeTruthy();
    });

    it('offers the server value back, and shows the number', () => {
      const onChange = jest.fn();
      const {getByTestId, getByText} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, min_p: 0.3}}
          onChange={onChange}
          serverDefaults={{min_p: 0.05}}
        />,
      );

      expect(getByText('Server default: 0.05 · Reset')).toBeTruthy();

      fireEvent.press(getByTestId('min_p-server-default-reset'));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('min_p', 0.05);
    });

    it('withholds a reported default the app would refuse on save', () => {
      const onChange = jest.fn();
      const {queryByTestId, getByTestId} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, top_k: 40, min_p: 0.3}}
          onChange={onChange}
          serverDefaults={{top_k: 0, min_p: 0.05}}
        />,
      );

      // `--top-k 0` is how llama.cpp disables top-k; this app's range starts
      // at 1, so offering it would produce a tap that Save then rejects.
      expect(queryByTestId('top_k-server-default-reset')).toBeNull();
      expect(queryByTestId('top_k-server-default')).toBeNull();

      // Same render, an in-range default on another control still offered —
      // so the absence above is the rule firing, not the whole row failing.
      fireEvent.press(getByTestId('min_p-server-default-reset'));
      expect(onChange).toHaveBeenCalledWith('min_p', 0.05);
    });

    it('compares a discrete control exactly', () => {
      const onDefault = render(
        <CompletionSettings
          settings={{...mockCompletionParams, mirostat: 0}}
          onChange={jest.fn()}
          serverDefaults={{mirostat: 0}}
        />,
      );
      expect(onDefault.getByTestId('mirostat-server-default')).toBeTruthy();

      const changed = render(
        <CompletionSettings
          settings={{...mockCompletionParams, mirostat: 1}}
          onChange={jest.fn()}
          serverDefaults={{mirostat: 0}}
        />,
      );
      expect(changed.getByTestId('mirostat-server-default-reset')).toBeTruthy();
    });

    it('treats n predict as one number with two presentations', () => {
      const onChange = jest.fn();
      const {getByTestId, getByText, queryByTestId, rerender} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, n_predict: 500}}
          onChange={onChange}
          serverDefaults={{n_predict: -1}}
        />,
      );

      expect(getByTestId('n_predict-input')).toBeTruthy();
      expect(getByText('Server default: -1 · Reset')).toBeTruthy();

      fireEvent.press(getByTestId('n_predict-server-default-reset'));
      expect(onChange).toHaveBeenCalledWith('n_predict', -1);

      rerender(
        <CompletionSettings
          settings={{...mockCompletionParams, n_predict: -1}}
          onChange={onChange}
          serverDefaults={{n_predict: -1}}
        />,
      );

      // -1 is Unlimited, so the numeric input unmounts rather than being left
      // showing a stale number.
      expect(queryByTestId('n_predict-input')).toBeNull();
      expect(getByTestId('n_predict-server-default')).toBeTruthy();
      expect(queryByTestId('n_predict-server-default-reset')).toBeNull();
    });

    it('renders a reported value at the resolution its control is edited at', () => {
      // Straight off the wire: the server reports IEEE doubles, and a test that
      // hand-writes 0.8 exercises a value no server ever sends.
      const wire = propsModelDescribing.default_generation_settings.params;
      expect(wire.temperature).toBe(0.800000011920929);
      expect(wire.min_p).toBe(0.05000000074505806);
      expect(wire.xtc_threshold).toBe(0.10000000149011612);

      const {getByText} = render(
        <CompletionSettings
          settings={{
            ...mockCompletionParams,
            temperature: 0.7,
            min_p: 0.3,
            xtc_threshold: 0.5,
            top_k: 10,
          }}
          onChange={jest.fn()}
          serverDefaults={{
            temperature: wire.temperature,
            min_p: wire.min_p,
            xtc_threshold: wire.xtc_threshold,
            top_k: wire.top_k,
          }}
        />,
      );

      expect(getByText('Server default: 0.8 · Reset')).toBeTruthy();
      expect(getByText('Server default: 0.05 · Reset')).toBeTruthy();
      expect(getByText('Server default: 0.1 · Reset')).toBeTruthy();
      // An integer-step control keeps its whole number.
      expect(getByText('Server default: 40 · Reset')).toBeTruthy();
    });

    it('resets to the exact reported value, not the rounded display', () => {
      const onChange = jest.fn();
      const wire = propsModelDescribing.default_generation_settings.params;
      const {getByTestId} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, temperature: 0.7}}
          onChange={onChange}
          serverDefaults={{temperature: wire.temperature}}
        />,
      );

      fireEvent.press(getByTestId('temperature-server-default-reset'));

      expect(onChange).toHaveBeenCalledWith('temperature', wire.temperature);
    });

    it('changes nothing while the settings are read-only', () => {
      const onChange = jest.fn();
      const {getByTestId} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, min_p: 0.3}}
          onChange={onChange}
          serverDefaults={{min_p: 0.05}}
          disabled
        />,
      );

      fireEvent.press(getByTestId('min_p-server-default-reset'));

      expect(onChange).not.toHaveBeenCalled();
    });
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

  it('hides text input when n_predict is -1 (unlimited)', () => {
    const {getByTestId, queryByTestId} = render(
      <CompletionSettings
        settings={{...mockCompletionParams, n_predict: -1}}
        onChange={jest.fn()}
      />,
    );

    expect(getByTestId('n_predict-unlimited-btn')).toBeTruthy();
    expect(getByTestId('n_predict-custom-btn')).toBeTruthy();
    expect(queryByTestId('n_predict-input')).toBeNull();
  });

  it('shows text input when n_predict is a custom value', () => {
    const {getByTestId} = render(
      <CompletionSettings
        settings={{...mockCompletionParams, n_predict: 500}}
        onChange={jest.fn()}
      />,
    );

    expect(getByTestId('n_predict-unlimited-btn')).toBeTruthy();
    expect(getByTestId('n_predict-custom-btn')).toBeTruthy();
    expect(getByTestId('n_predict-input')).toBeTruthy();
  });

  it('switches n_predict between unlimited and custom via segmented buttons', () => {
    const mockOnChange = jest.fn();
    const {getByText} = render(
      <CompletionSettings
        settings={{...mockCompletionParams, n_predict: 500}}
        onChange={mockOnChange}
      />,
    );

    // Select Unlimited → should set to -1
    fireEvent.press(getByText('Unlimited'));
    expect(mockOnChange).toHaveBeenCalledWith('n_predict', -1);

    // Select Custom → should set to 1024
    mockOnChange.mockClear();
    fireEvent.press(getByText('Custom'));
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
