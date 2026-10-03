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

  describe('generation parameter modes', () => {
    it.each([
      ['temperature', 'temperature-mode-send'],
      ['seed', 'seed-mode-send'],
      ['jinja', 'jinja-mode-send'],
      ['stop', 'stop-mode-send'],
      ['reasoning', 'reasoning-mode-send'],
    ] as const)(
      'changes only the %s mode and retains its custom value',
      (name, testID) => {
        const onChange = jest.fn();
        const settings = {
          ...mockCompletionParams,
          temperature: 0.73,
          seed: 0,
          jinja: false,
          stop: ['END'],
          reasoning: {enabled: false, effort: 'high'},
          generationParameterModes: {[name]: 'omit' as const},
        };
        const {getByTestId} = render(
          <CompletionSettings
            settings={settings}
            onChange={onChange}
            allowInherit
          />,
        );

        fireEvent.press(getByTestId(testID));

        expect(onChange).toHaveBeenCalledWith(
          'generationParameterModes',
          expect.objectContaining({[name]: 'send'}),
        );
        expect(onChange).not.toHaveBeenCalledWith(name, expect.anything());
        expect(settings[name]).toEqual(
          {
            temperature: 0.73,
            seed: 0,
            jinja: false,
            stop: ['END'],
            reasoning: {enabled: false, effort: 'high'},
          }[name],
        );
      },
    );

    it('does not validate an invalid retained numeric value while omitted', () => {
      const {getByTestId, queryByText} = render(
        <CompletionSettings
          settings={{
            ...mockCompletionParams,
            seed: 'invalid' as any,
            generationParameterModes: {seed: 'omit'},
          }}
          onChange={jest.fn()}
        />,
      );

      expect(getByTestId('seed-input').props.editable).toBe(false);
      expect(queryByText('Please enter a valid number')).toBeNull();
    });

    it.each([
      ['temperature', 0],
      ['jinja', false],
      ['n_predict', -1],
    ] as const)(
      'keeps the explicit %s sentinel distinct from omission',
      (key, value) => {
        const settings = {
          ...mockCompletionParams,
          [key]: value,
          generationParameterModes: {[key]: 'send' as const},
        };
        const {getByTestId} = render(
          <CompletionSettings settings={settings} onChange={jest.fn()} />,
        );

        expect(getByTestId(`${key}-effective-source`)).toHaveTextContent(
          'Effective source: custom value',
        );
        expect(getByTestId(`${key}-mode-omit`)).toBeTruthy();
      },
    );

    it('keeps dependent Mirostat modes visible but disables their values when Mirostat is omitted', () => {
      const {getByTestId} = render(
        <CompletionSettings
          settings={{
            ...mockCompletionParams,
            mirostat: 2,
            generationParameterModes: {mirostat: 'omit'},
          }}
          onChange={jest.fn()}
          allowInherit
        />,
      );

      expect(getByTestId('mirostat_tau-mode-send')).toBeTruthy();
      expect(getByTestId('mirostat_eta-mode-send')).toBeTruthy();
      expect(getByTestId('mirostat_tau-slider').props.disabled).toBe(true);
      expect(getByTestId('mirostat_eta-slider').props.disabled).toBe(true);
    });

    it('distinguishes provider default, explicit thinking On, explicit thinking Off, and explicit effort', () => {
      const onChange = jest.fn();
      const {getByTestId, rerender} = render(
        <CompletionSettings
          settings={{
            ...mockCompletionParams,
            reasoning: {enabled: false, effort: 'high'},
            generationParameterModes: {
              reasoning: 'omit',
              enable_thinking: 'omit',
              reasoning_effort: 'omit',
            },
          }}
          onChange={onChange}
          allowInherit
        />,
      );

      expect(getByTestId('reasoning-effective-source')).toHaveTextContent(
        'Effective source: provider/native default (parameter is not sent)',
      );
      fireEvent.press(getByTestId('reasoning-mode-send'));
      expect(onChange).toHaveBeenCalledWith(
        'generationParameterModes',
        expect.objectContaining({
          reasoning: 'send',
          enable_thinking: 'send',
        }),
      );

      rerender(
        <CompletionSettings
          settings={{
            ...mockCompletionParams,
            reasoning: {enabled: false, effort: 'high'},
            generationParameterModes: {
              reasoning: 'send',
              enable_thinking: 'send',
              reasoning_effort: 'send',
            },
          }}
          onChange={onChange}
          allowInherit
        />,
      );
      fireEvent.press(getByTestId('reasoning-value-on'));
      fireEvent.press(getByTestId('reasoning-value-off'));
      fireEvent.press(getByTestId('reasoning-effort-low'));
      expect(onChange).toHaveBeenCalledWith(
        'reasoning',
        expect.objectContaining({enabled: true}),
      );
      expect(onChange).toHaveBeenCalledWith(
        'reasoning',
        expect.objectContaining({enabled: false}),
      );
      expect(onChange).toHaveBeenCalledWith('reasoning_effort', 'low');
    });

    it('uses localized labels and explains that omission uses the provider default', () => {
      const {getAllByText, getByTestId} = render(
        <CompletionSettings
          settings={mockCompletionParams}
          onChange={jest.fn()}
          allowInherit
        />,
      );

      expect(getAllByText('Use provider default').length).toBeGreaterThan(0);
      expect(getAllByText('Use custom value').length).toBeGreaterThan(0);
      expect(getAllByText('Inherit').length).toBeGreaterThan(0);
      expect(getByTestId('temperature-effective-source')).not.toHaveTextContent(
        'disabled',
      );
    });
  });
});
