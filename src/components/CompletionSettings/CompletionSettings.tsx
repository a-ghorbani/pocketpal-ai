import {View} from 'react-native';
import React from 'react';

import {InputSlider} from '../InputSlider';
import {Text, Switch, SegmentedButtons} from 'react-native-paper';

import {TextInput} from '..';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {L10nContext} from '../../utils';
import {
  COMPLETION_PARAMS_METADATA,
  validateNumericField,
} from '../../utils/modelSettings';
import {CompletionParams} from '../../utils/completionTypes';

interface Props {
  settings: CompletionParams;
  onChange: (name: string, value: any) => void;
  disabled?: boolean;
}

export const CompletionSettings: React.FC<Props> = ({
  settings,
  onChange,
  disabled = false,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = React.useContext(L10nContext);

  const renderSlider = ({name, step = 0.01}: {name: string; step?: number}) => (
    <View style={styles.settingItem}>
      <InputSlider
        testID={`${name}-slider`}
        label={name.toUpperCase().replace('_', ' ')}
        labelVariant="labelSmall"
        description={l10n.completionParams[name]}
        value={settings[name]}
        onValueChange={value => onChange(name, value)}
        min={COMPLETION_PARAMS_METADATA[name]?.validation.min}
        max={COMPLETION_PARAMS_METADATA[name]?.validation.max}
        step={step}
        precision={Number.isInteger(step) ? 0 : 2}
        debounceMs={300} // Enable debouncing for sliders
        disabled={disabled}
      />
    </View>
  );

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
      </View>
    );
  };

  return (
    <View style={styles.container} testID="completion-settings">
      {renderIntegerInput({name: 'n_predict'})}
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
      {(settings.mirostat ?? 0) > 0 && (
        <>
          {renderSlider({name: 'mirostat_tau', step: 1})}
          {renderSlider({name: 'mirostat_eta'})}
        </>
      )}
      {renderIntegerInput({name: 'seed'})}
      {renderSwitch('jinja')}
    </View>
  );
};
