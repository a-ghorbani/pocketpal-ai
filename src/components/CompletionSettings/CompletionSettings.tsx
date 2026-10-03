import React from 'react';
import {View} from 'react-native';
import {SegmentedButtons, Switch, Text} from 'react-native-paper';

import {TextInput} from '..';
import {InputSlider} from '../InputSlider';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {
  COMPLETION_PARAMS_METADATA,
  validateNumericField,
} from '../../utils/modelSettings';
import {
  CompletionParams,
  GenerationParameterMode,
  OptionalGenerationParameter,
} from '../../utils/completionTypes';
import {createStyles} from './styles';

interface Props {
  settings: CompletionParams;
  onChange: (name: string, value: any) => void;
  disabled?: boolean;
  allowInherit?: boolean;
}

const DISPLAY_NAMES: Partial<Record<OptionalGenerationParameter, string>> = {
  n_predict: 'N PREDICT',
  include_thinking_in_context: 'INCLUDE THINKING IN CONTEXT',
};

export const CompletionSettings: React.FC<Props> = ({
  settings,
  onChange,
  disabled = false,
  allowInherit = false,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = React.useContext(L10nContext);

  const modeFor = (
    name: OptionalGenerationParameter,
  ): GenerationParameterMode =>
    (name === 'reasoning'
      ? (settings.generationParameterModes?.reasoning ??
        settings.generationParameterModes?.enable_thinking)
      : settings.generationParameterModes?.[name]) ?? 'send';

  const updateMode = (
    name: OptionalGenerationParameter,
    mode: GenerationParameterMode,
  ) => {
    onChange('generationParameterModes', {
      ...settings.generationParameterModes,
      [name]: mode,
      ...(name === 'reasoning' ? {enable_thinking: mode} : {}),
    });
  };

  const renderMode = (
    name: OptionalGenerationParameter,
    options?: {modeDisabled?: boolean},
  ) => {
    const mode = modeFor(name);
    const source =
      mode === 'omit'
        ? l10n.components.completionSettings.sourceProviderDefault
        : mode === 'inherit'
          ? l10n.components.completionSettings.sourceInherited
          : l10n.components.completionSettings.sourceCustom;
    const buttons = [
      {
        value: 'omit',
        label: l10n.components.completionSettings.useProviderDefault,
        testID: `${name}-mode-omit`,
        disabled: disabled || options?.modeDisabled,
      },
      ...(allowInherit
        ? [
            {
              value: 'inherit',
              label: l10n.components.completionSettings.inherit,
              testID: `${name}-mode-inherit`,
              disabled: disabled || options?.modeDisabled,
            },
          ]
        : []),
      {
        value: 'send',
        label: l10n.components.completionSettings.useCustomValue,
        testID: `${name}-mode-send`,
        disabled: disabled || options?.modeDisabled,
      },
    ];

    return (
      <>
        <SegmentedButtons
          value={mode}
          onValueChange={value =>
            updateMode(name, value as GenerationParameterMode)
          }
          buttons={buttons}
          density="high"
          style={styles.segmentedButtons}
        />
        <Text
          variant="bodySmall"
          style={styles.description}
          testID={`${name}-effective-source`}>
          {l10n.components.completionSettings.effectiveSource}: {source}
        </Text>
      </>
    );
  };

  const renderHeader = (
    name: OptionalGenerationParameter,
    description?: string,
  ) => (
    <>
      <Text variant="labelSmall" style={styles.settingLabel}>
        {DISPLAY_NAMES[name] ?? name.toUpperCase().replace(/_/g, ' ')}
      </Text>
      {!!description && <Text style={styles.description}>{description}</Text>}
    </>
  );

  const renderSlider = ({
    name,
    step = 0.01,
    dependentDisabled = false,
  }: {
    name: OptionalGenerationParameter;
    step?: number;
    dependentDisabled?: boolean;
  }) => {
    const custom = modeFor(name) === 'send';
    const validation = COMPLETION_PARAMS_METADATA[name]?.validation;
    const numericValidation =
      validation?.type === 'numeric' ? validation : undefined;
    return (
      <View style={styles.settingItem}>
        {renderHeader(name, l10n.completionParams[name])}
        {renderMode(name, {modeDisabled: dependentDisabled})}
        <InputSlider
          testID={`${name}-slider`}
          label=""
          labelVariant="labelSmall"
          value={settings[name] as number}
          onValueChange={value => onChange(name, value)}
          min={numericValidation?.min}
          max={numericValidation?.max}
          step={step}
          precision={Number.isInteger(step) ? 0 : 2}
          debounceMs={300}
          disabled={disabled || dependentDisabled || !custom}
        />
      </View>
    );
  };

  const renderIntegerInput = (name: 'seed' | 'n_probs') => {
    const metadata = COMPLETION_PARAMS_METADATA[name];
    if (!metadata) {
      return null;
    }
    const value = settings[name]?.toString() ?? '';
    const custom = modeFor(name) === 'send';
    const validation = custom
      ? validateNumericField(value, metadata.validation)
      : {isValid: true};

    return (
      <View style={styles.settingItem}>
        {renderHeader(name, l10n.completionParams[name])}
        {renderMode(name)}
        <TextInput
          value={value}
          onChangeText={_value => onChange(name, _value)}
          keyboardType="numeric"
          error={!validation.isValid}
          helperText={validation.errorMessage}
          editable={!disabled && custom}
          testID={`${name}-input`}
        />
      </View>
    );
  };

  const renderSwitch = (name: 'include_thinking_in_context' | 'jinja') => {
    const custom = modeFor(name) === 'send';
    return (
      <View style={styles.settingItem}>
        {renderHeader(name, l10n.completionParams[name])}
        {renderMode(name)}
        <View style={styles.switchHeader}>
          <Text>{l10n.components.completionSettings.customValue}</Text>
          <Switch
            value={settings[name] ?? false}
            onValueChange={value => onChange(name, value)}
            disabled={disabled || !custom}
            testID={`${name}-switch`}
          />
        </View>
      </View>
    );
  };

  const renderStop = () => {
    const custom = modeFor('stop') === 'send';
    const value = Array.isArray(settings.stop)
      ? settings.stop.join('\n')
      : (settings.stop ?? '');
    return (
      <View style={styles.settingItem}>
        {renderHeader('stop', l10n.completionParams.stop)}
        {renderMode('stop')}
        <TextInput
          value={value}
          onChangeText={text =>
            onChange(
              'stop',
              text
                .split('\n')
                .map(item => item.trim())
                .filter(Boolean),
            )
          }
          editable={!disabled && custom}
          multiline
          testID="stop-input"
        />
      </View>
    );
  };

  const renderMirostatSelector = () => {
    const custom = modeFor('mirostat') === 'send';
    return (
      <View style={styles.settingItem}>
        {renderHeader('mirostat', l10n.completionParams.mirostat)}
        {renderMode('mirostat')}
        <SegmentedButtons
          value={(settings.mirostat ?? 0).toString()}
          onValueChange={value => onChange('mirostat', parseInt(value, 10))}
          density="high"
          buttons={[
            {
              value: '0',
              label: l10n.components.completionSettings.off,
              testID: 'mirostat-value-off',
              disabled: disabled || !custom,
            },
            {
              value: '1',
              label: 'v1',
              testID: 'mirostat-value-1',
              disabled: disabled || !custom,
            },
            {
              value: '2',
              label: 'v2',
              testID: 'mirostat-value-2',
              disabled: disabled || !custom,
            },
          ]}
          style={styles.segmentedButtons}
        />
      </View>
    );
  };

  const renderNPredictField = () => {
    const metadata = COMPLETION_PARAMS_METADATA.n_predict;
    const value = settings.n_predict?.toString() ?? '';
    const custom = modeFor('n_predict') === 'send';
    const isUnlimited = settings.n_predict === -1;
    const validation =
      custom && metadata
        ? validateNumericField(value, metadata.validation)
        : {isValid: true};

    return (
      <View style={styles.settingItem}>
        {renderHeader('n_predict', l10n.completionParams.n_predict)}
        {renderMode('n_predict')}
        <SegmentedButtons
          value={isUnlimited ? 'unlimited' : 'custom'}
          onValueChange={selected =>
            onChange('n_predict', selected === 'unlimited' ? -1 : 1024)
          }
          density="high"
          buttons={[
            {
              value: 'unlimited',
              label: l10n.components.completionSettings.unlimited,
              testID: 'n_predict-unlimited-btn',
              disabled: disabled || !custom,
            },
            {
              value: 'custom',
              label: l10n.components.completionSettings.custom,
              testID: 'n_predict-custom-btn',
              disabled: disabled || !custom,
            },
          ]}
          style={styles.segmentedButtons}
        />
        {!isUnlimited && (
          <TextInput
            value={value}
            onChangeText={_value => onChange('n_predict', _value)}
            keyboardType="numeric"
            error={!validation.isValid}
            helperText={validation.errorMessage}
            editable={!disabled && custom}
            testID="n_predict-input"
          />
        )}
      </View>
    );
  };

  const renderThinking = () => {
    const custom = modeFor('reasoning') === 'send';
    const enabled =
      settings.reasoning?.enabled ?? settings.enable_thinking ?? false;
    const effortCustom = modeFor('reasoning_effort') === 'send';
    const effort =
      settings.reasoning?.effort ?? settings.reasoning_effort ?? '';
    const effortValues = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

    return (
      <>
        <View style={styles.settingItem}>
          {renderHeader(
            'reasoning',
            l10n.components.completionSettings.thinkingDescription,
          )}
          {renderMode('reasoning')}
          <SegmentedButtons
            value={enabled ? 'on' : 'off'}
            onValueChange={value => {
              const next = value === 'on';
              onChange('reasoning', {...settings.reasoning, enabled: next});
              onChange('enable_thinking', next);
            }}
            density="high"
            buttons={[
              {
                value: 'on',
                label: l10n.components.completionSettings.on,
                testID: 'reasoning-value-on',
                disabled: disabled || !custom,
              },
              {
                value: 'off',
                label: l10n.components.completionSettings.off,
                testID: 'reasoning-value-off',
                disabled: disabled || !custom,
              },
            ]}
            style={styles.segmentedButtons}
          />
        </View>
        <View style={styles.settingItem}>
          {renderHeader(
            'reasoning_effort',
            l10n.components.completionSettings.reasoningEffortDescription,
          )}
          {renderMode('reasoning_effort')}
          <SegmentedButtons
            value={effort}
            onValueChange={value => {
              onChange('reasoning', {...settings.reasoning, effort: value});
              onChange('reasoning_effort', value);
            }}
            density="high"
            buttons={effortValues.map(value => ({
              value,
              label:
                l10n.components.modelSettingsSheet.effortLevels[
                  value as keyof typeof l10n.components.modelSettingsSheet.effortLevels
                ],
              testID: `reasoning-effort-${value}`,
              disabled: disabled || !effortCustom,
            }))}
            style={styles.segmentedButtons}
          />
        </View>
      </>
    );
  };

  const mirostatActive =
    modeFor('mirostat') === 'send' && (settings.mirostat ?? 0) > 0;

  return (
    <View style={styles.container} testID="completion-settings">
      {renderNPredictField()}
      {renderThinking()}
      {renderSwitch('include_thinking_in_context')}
      {renderSlider({name: 'temperature'})}
      {renderSlider({name: 'top_k', step: 1})}
      {renderSlider({name: 'top_p'})}
      {renderSlider({name: 'min_p'})}
      {renderSlider({name: 'xtc_threshold'})}
      {renderSlider({name: 'xtc_probability'})}
      {renderSlider({name: 'typical_p'})}
      {renderSlider({name: 'penalty_last_n', step: 1})}
      {renderSlider({name: 'penalty_repeat'})}
      {renderSlider({name: 'penalty_freq'})}
      {renderSlider({name: 'penalty_present'})}
      {renderMirostatSelector()}
      {renderSlider({
        name: 'mirostat_tau',
        step: 1,
        dependentDisabled: !mirostatActive,
      })}
      {renderSlider({
        name: 'mirostat_eta',
        dependentDisabled: !mirostatActive,
      })}
      {renderIntegerInput('seed')}
      {renderIntegerInput('n_probs')}
      {renderStop()}
      {renderSwitch('jinja')}
    </View>
  );
};
