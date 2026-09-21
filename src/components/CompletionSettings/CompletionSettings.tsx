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
import {SamplerParam, Samplers} from '../../utils/samplerParams';
import {serverDefaultState, stepOf} from './serverDefaultState';

const displayNameOf = (name: string): string =>
  name.toUpperCase().replace(/_/g, ' ');

interface Props {
  settings: CompletionParams;
  onChange: (name: string, value: any) => void;
  disabled?: boolean;
  serverDefaults?: Samplers;
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

  const renderServerDefault = (name: SamplerParam) => {
    if (!serverDefaults) {
      return null;
    }
    const row = serverDefaultState(
      name,
      Number(settings[name]),
      serverDefaults[name],
    );
    const copy = l10n.components.completionSettings;
    const caption = (text: string) => (
      <Text
        variant="labelSmall"
        style={styles.serverDefault}
        testID={`${name}-server-default`}>
        {text}
      </Text>
    );
    switch (row.kind) {
      case 'none':
        return null;
      case 'omitted':
        return caption(
          row.shown === undefined
            ? copy.usingServerDefaultUnreported
            : t(copy.usingServerDefault, {value: String(row.shown)}),
        );
      case 'matches':
        return caption(copy.serverDefault);
      case 'reset':
        return (
          <TouchableOpacity
            onPress={disabled ? undefined : () => onChange(name, row.resetTo)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{disabled}}
            accessibilityLabel={t(copy.resetToServerDefaultAccessibilityLabel, {
              name: displayNameOf(name),
              value: String(row.shown),
            })}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            style={styles.serverDefaultResetTarget}
            testID={`${name}-server-default-reset`}>
            <Text
              variant="labelSmall"
              style={
                disabled
                  ? styles.serverDefaultResetDisabled
                  : styles.serverDefaultReset
              }>
              {t(copy.resetToServerDefault, {value: String(row.shown)})}
            </Text>
          </TouchableOpacity>
        );
    }
  };

  const renderSlider = ({name}: {name: SamplerParam}) => {
    const metadata = COMPLETION_PARAMS_METADATA[name];
    const range =
      metadata?.validation.type === 'numeric' ? metadata.validation : undefined;
    const step = stepOf(name);

    return (
      <View style={styles.settingItem}>
        <InputSlider
          testID={`${name}-slider`}
          label={displayNameOf(name)}
          labelVariant="labelSmall"
          description={l10n.completionParams[name]}
          value={settings[name] as number}
          onValueChange={value => onChange(name, value)}
          min={range?.min}
          max={range?.max}
          step={step}
          precision={Number.isInteger(step) ? 0 : 2}
          debounceMs={300} // Enable debouncing for sliders
          disabled={disabled}
        />
        {renderServerDefault(name)}
      </View>
    );
  };

  const renderIntegerInput = ({name}: {name: SamplerParam}) => {
    const metadata = COMPLETION_PARAMS_METADATA[name];
    if (!metadata) {
      return null;
    }

    const value = settings[name]?.toString() ?? '';
    const validation = validateNumericField(value, metadata.validation);

    return (
      <View style={styles.settingItem}>
        <Text variant="labelSmall" style={styles.settingLabel}>
          {displayNameOf(name)}
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
        {renderServerDefault('mirostat')}
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
        {renderServerDefault('n_predict')}
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
