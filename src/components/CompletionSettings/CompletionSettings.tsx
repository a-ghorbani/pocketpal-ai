import {TouchableOpacity, View} from 'react-native';
import React from 'react';

import {InputSlider} from '../InputSlider';
import {Text, Switch, SegmentedButtons} from 'react-native-paper';

import {TextInput} from '..';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {
  COMPLETION_PARAMS_METADATA,
  validateNumericField,
} from '../../utils/modelSettings';
import {CompletionParams} from '../../utils/completionTypes';
import {SamplerDefaults} from '../../utils/types';

interface Props {
  settings: CompletionParams;
  onChange: (name: string, value: any) => void;
  disabled?: boolean;
  serverDefaults?: SamplerDefaults;
}

export const CompletionSettings: React.FC<Props> = ({
  settings,
  onChange,
  disabled = false,
  serverDefaults,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = React.useContext(L10nContext);

  /**
   * What the server says this parameter defaults to, and whether the editor is
   * still on it. `tolerance` is half a slider step, so a quantised float does
   * not read as a deliberate change; a discrete control passes 0 and compares
   * exactly.
   */
  const renderServerDefault = (name: string, tolerance: number) => {
    const serverValue = serverDefaults?.[name];
    if (serverValue === undefined) {
      return null;
    }
    const current = Number(settings[name]);
    const matches =
      tolerance > 0
        ? Math.abs(current - serverValue) < tolerance
        : current === serverValue;

    if (matches) {
      return (
        <Text
          variant="labelSmall"
          style={styles.serverDefault}
          testID={`${name}-server-default`}>
          {l10n.components.completionSettings.serverDefault}
        </Text>
      );
    }

    return (
      <TouchableOpacity
        onPress={disabled ? undefined : () => onChange(name, serverValue)}
        disabled={disabled}
        testID={`${name}-server-default-reset`}>
        <Text variant="labelSmall" style={styles.serverDefaultReset}>
          {t(l10n.components.completionSettings.resetToServerDefault, {
            value: String(serverValue),
          })}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSlider = ({name}: {name: string}) => {
    const metadata = COMPLETION_PARAMS_METADATA[name];
    const step = metadata?.step ?? 0.01;

    return (
      <View style={styles.settingItem}>
        <InputSlider
          testID={`${name}-slider`}
          label={name.toUpperCase().replace('_', ' ')}
          labelVariant="labelSmall"
          description={l10n.completionParams[name]}
          value={settings[name]}
          onValueChange={value => onChange(name, value)}
          min={metadata?.validation.min}
          max={metadata?.validation.max}
          step={step}
          precision={Number.isInteger(step) ? 0 : 2}
          debounceMs={300} // Enable debouncing for sliders
          disabled={disabled}
        />
        {renderServerDefault(name, step / 2)}
      </View>
    );
  };

  const renderIntegerInput = ({name}: {name: keyof CompletionParams}) => {
    const metadata = COMPLETION_PARAMS_METADATA[name];
    if (!metadata) {
      return null;
    }

    const value = settings[name]?.toString() ?? '';
    const validation = validateNumericField(value, metadata.validation);

    return (
      <View style={styles.settingItem}>
        <Text variant="labelSmall" style={styles.settingLabel}>
          {String(name).toUpperCase().replace('_', ' ')}
        </Text>
        <Text style={styles.description}>
          {l10n.completionParams[String(name)]}
        </Text>
        <TextInput
          value={value}
          onChangeText={
            disabled ? () => {} : _value => onChange(String(name), _value)
          }
          keyboardType="numeric"
          error={!validation.isValid}
          helperText={validation.errorMessage}
          editable={!disabled}
          testID={`${String(name)}-input`}
        />
        {renderServerDefault(String(name), 0)}
      </View>
    );
  };

  const renderSwitch = (name: string) => {
    // Convert snake_case to UPPER CASE with spaces for display
    const displayName = name.toUpperCase().replace(/_/g, ' ');

    return (
      <View style={styles.settingItem}>
        <View style={styles.switchHeader}>
          <Text variant="labelSmall" style={styles.settingLabel}>
            {displayName}
          </Text>
          <Switch
            value={settings[name]}
            onValueChange={disabled ? () => {} : value => onChange(name, value)}
            disabled={disabled}
            testID={`${name}-switch`}
          />
        </View>
        <Text style={styles.description}>{l10n.completionParams[name]}</Text>
      </View>
    );
  };

  const renderMirostatSelector = () => {
    const description = l10n.completionParams.mirostat;

    return (
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>Mirostat</Text>
        {description && <Text style={styles.description}>{description}</Text>}
        <SegmentedButtons
          value={(settings.mirostat ?? 0).toString()}
          onValueChange={
            disabled
              ? () => {} // No-op function when disabled
              : value => onChange('mirostat', parseInt(value, 10))
          }
          density="high"
          buttons={[
            {
              value: '0',
              label: 'Off',
            },
            {
              value: '1',
              label: 'v1',
            },
            {
              value: '2',
              label: 'v2',
            },
          ]}
          style={styles.segmentedButtons}
        />
        {renderServerDefault('mirostat', 0)}
      </View>
    );
  };

  const isUnlimited = settings.n_predict === -1;

  const renderNPredictField = () => {
    const metadata = COMPLETION_PARAMS_METADATA.n_predict;
    const value = settings.n_predict?.toString() ?? '';
    const validation = metadata
      ? validateNumericField(value, metadata.validation)
      : {isValid: true};

    return (
      <View style={styles.settingItem}>
        <Text variant="labelSmall" style={styles.settingLabel}>
          N PREDICT
        </Text>
        <Text style={styles.description}>
          {l10n.completionParams.n_predict}
        </Text>
        <SegmentedButtons
          value={isUnlimited ? 'unlimited' : 'custom'}
          onValueChange={
            disabled
              ? () => {}
              : selected =>
                  onChange('n_predict', selected === 'unlimited' ? -1 : 1024)
          }
          density="high"
          buttons={[
            {
              value: 'unlimited',
              label: 'Unlimited',
              testID: 'n_predict-unlimited-btn',
            },
            {
              value: 'custom',
              label: 'Custom',
              testID: 'n_predict-custom-btn',
            },
          ]}
          style={styles.segmentedButtons}
        />
        {!isUnlimited && (
          <TextInput
            value={value}
            onChangeText={
              disabled ? () => {} : _value => onChange('n_predict', _value)
            }
            keyboardType="numeric"
            error={!validation.isValid}
            helperText={validation.errorMessage}
            editable={!disabled}
            testID="n_predict-input"
          />
        )}
        {renderServerDefault('n_predict', 0)}
      </View>
    );
  };

  return (
    <View style={styles.container} testID="completion-settings">
      {renderNPredictField()}
      {renderSwitch('include_thinking_in_context')}
      {renderSlider({name: 'temperature'})}
      {renderSlider({name: 'top_k'})}
      {renderSlider({name: 'top_p'})}
      {renderSlider({name: 'min_p'})}
      {renderSlider({name: 'xtc_threshold'})}
      {renderSlider({name: 'xtc_probability'})}
      {renderSlider({name: 'typical_p'})}
      {renderSlider({name: 'penalty_last_n'})}
      {renderSlider({name: 'penalty_repeat'})}
      {renderSlider({name: 'penalty_freq'})}
      {renderSlider({name: 'penalty_present'})}
      {renderMirostatSelector()}
      {(settings.mirostat ?? 0) > 0 && (
        <>
          {renderSlider({name: 'mirostat_tau'})}
          {renderSlider({name: 'mirostat_eta'})}
        </>
      )}
      {renderIntegerInput({name: 'seed'})}
      {renderSwitch('jinja')}
    </View>
  );
};
