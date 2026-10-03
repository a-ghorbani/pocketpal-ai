import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {CompletionSettings} from '../CompletionSettings';
import {mockCompletionParams} from '../../../../jest/fixtures/models';
import {defaultCompletionParams} from '../../../utils/completionSettingsVersions';

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

  it('spaces every underscore in a sampler label', () => {
    const {getByText, queryByText} = render(
      <CompletionSettings
        settings={mockCompletionParams}
        onChange={jest.fn()}
      />,
    );

    expect(getByText('PENALTY LAST N')).toBeTruthy();
    expect(queryByText('PENALTY LAST_N')).toBeNull();
  });

  describe('server defaults', () => {
    it('shows no row anywhere without a server that reports defaults', () => {
      const {queryAllByTestId} = render(
        <CompletionSettings
          settings={{...defaultCompletionParams, mirostat: 1}}
          onChange={jest.fn()}
        />,
      );

      expect(queryAllByTestId(/server-default/)).toHaveLength(0);
    });

    it("says a left-out sampler is the server's even when its value is unknown", () => {
      const {getByTestId, queryByTestId} = render(
        <CompletionSettings
          settings={defaultCompletionParams}
          onChange={jest.fn()}
          serverDefaults={{}}
        />,
      );

      const leftToServer = [
        'top_k',
        'min_p',
        'xtc_threshold',
        'xtc_probability',
        'typical_p',
        'penalty_last_n',
        'penalty_repeat',
        'penalty_freq',
        'penalty_present',
        'mirostat',
      ];
      for (const name of leftToServer) {
        expect(getByTestId(`${name}-server-default`)).toHaveTextContent(
          'Using server default (not reported)',
        );
      }
      for (const name of ['temperature', 'top_p', 'n_predict']) {
        expect(queryByTestId(`${name}-server-default`)).toBeNull();
        expect(queryByTestId(`${name}-server-default-reset`)).toBeNull();
      }
    });

    it('never shows a row for the seed', () => {
      const {queryAllByTestId} = render(
        <CompletionSettings
          settings={{...defaultCompletionParams, seed: 42}}
          onChange={jest.fn()}
          serverDefaults={{seed: 1234}}
        />,
      );

      expect(queryAllByTestId(/^seed-server-default/)).toHaveLength(0);
    });

    it('shows nothing for a moved parameter the server did not report', () => {
      const {queryByTestId} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, min_p: 0.3}}
          onChange={jest.fn()}
          serverDefaults={{top_k: 40}}
        />,
      );

      expect(queryByTestId('top_k-server-default')).toBeTruthy();
      expect(queryByTestId('min_p-server-default')).toBeNull();
      expect(queryByTestId('min_p-server-default-reset')).toBeNull();
    });

    it('reads a value moved onto the server default as such', () => {
      const {getByTestId, queryByTestId} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, top_k: 20}}
          onChange={jest.fn()}
          serverDefaults={{top_k: 20}}
        />,
      );

      expect(getByTestId('top_k-server-default')).toHaveTextContent(
        'server default',
      );
      expect(queryByTestId('top_k-server-default-reset')).toBeNull();
    });

    it('names the reported number when the control is on the app default', () => {
      // At the app default the sampler is not forwarded at all, so 20 is what
      // the server actually runs and there is nothing to reset to.
      const {getByTestId, getByText, queryByTestId} = render(
        <CompletionSettings
          settings={{
            ...mockCompletionParams,
            top_k: defaultCompletionParams.top_k,
          }}
          onChange={jest.fn()}
          serverDefaults={{top_k: 20}}
        />,
      );

      expect(getByTestId('top_k-server-default')).toBeTruthy();
      expect(getByText('Using server default: 20')).toBeTruthy();
      expect(queryByTestId('top_k-server-default-reset')).toBeNull();
    });

    it('shows the reported number and resets to the value the row names', () => {
      const onChange = jest.fn();
      const {getByTestId, getByText} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, top_k: 30}}
          onChange={onChange}
          serverDefaults={{top_k: 20}}
        />,
      );

      expect(getByText('Server default: 20 · Reset')).toBeTruthy();

      fireEvent.press(getByTestId('top_k-server-default-reset'));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        'top_k',
        defaultCompletionParams.top_k,
      );
    });

    it('exposes the reset as a labelled button with a reachable target', () => {
      const {getByTestId} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, min_p: 0.3}}
          onChange={jest.fn()}
          serverDefaults={{min_p: 0.05}}
        />,
      );

      const reset = getByTestId('min_p-server-default-reset');
      expect(reset.props.accessibilityRole).toBe('button');
      expect(reset.props.accessibilityLabel).toBe(
        'Reset MIN P to the server default, 0.05',
      );
      expect(reset.props.hitSlop).toEqual({
        top: 8,
        bottom: 8,
        left: 8,
        right: 8,
      });
    });

    it('marks the reset dead when the settings are not the editable source', () => {
      const onChange = jest.fn();
      const enabled = render(
        <CompletionSettings
          settings={{...mockCompletionParams, min_p: 0.3}}
          onChange={onChange}
          serverDefaults={{min_p: 0.05}}
        />,
      );
      const enabledColor = enabled.getByText('Server default: 0.05 · Reset')
        .props.style;

      const {getByTestId, getByText} = render(
        <CompletionSettings
          settings={{...mockCompletionParams, min_p: 0.3}}
          onChange={onChange}
          serverDefaults={{min_p: 0.05}}
          disabled
        />,
      );

      const reset = getByTestId('min_p-server-default-reset');
      expect(reset.props.accessibilityState).toEqual({disabled: true});
      fireEvent.press(reset);
      expect(onChange).not.toHaveBeenCalled();
      // A control that cannot act must not look like one that can.
      expect(getByText('Server default: 0.05 · Reset').props.style).not.toEqual(
        enabledColor,
      );
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
