import {View} from 'react-native';
import React, {useState, useEffect} from 'react';

import Slider from '@react-native-community/slider';
import {CompletionParams} from '@pocketpalai/llama.rn';
import {Text, Switch, Chip, SegmentedButtons} from 'react-native-paper';

import {TextInput} from '../../../components';

import {useTheme} from '../../../hooks';

import {createStyles} from './styles';

import {L10nContext} from '../../../utils';
import {
  COMPLETION_PARAMS_METADATA,
  validateNumericField,
} from '../../../utils/modelSettings';

interface Props {
  settings: CompletionParams;
  onChange: (name: string, value: any) => void;
}

export const CompletionSettings: React.FC<Props> = ({settings, onChange}) => {
  const [localSliderValues, setLocalSliderValues] = useState({});
  const [newStopWord, setNewStopWord] = useState('');
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = React.useContext(L10nContext);

  // Reset local values when settings change
  useEffect(() => {
    setLocalSliderValues({});
  }, [settings]);

  const handleOnChange = (name, value) => {
    onChange(name, value);
  };

  const renderSlider = ({name, step = 0.01}: {name: string; step?: number}) => (
    <View style={styles.settingItem}>
      <Text variant="labelSmall" style={styles.settingLabel}>
        {name.toUpperCase().replace('_', ' ')}
      </Text>
      <Text style={styles.description}>
        {l10n[COMPLETION_PARAMS_METADATA[name]?.descriptionKey]}
      </Text>
      <Slider
        style={styles.slider}
        minimumValue={COMPLETION_PARAMS_METADATA[name]?.validation.min}
        maximumValue={COMPLETION_PARAMS_METADATA[name]?.validation.max}
        step={step}
        value={localSliderValues[name] ?? settings[name]}
        onValueChange={value => {
          setLocalSliderValues(prev => ({...prev, [name]: value}));
        }}
        onSlidingComplete={value => {
          handleOnChange(name, value);
        }}
        thumbTintColor={theme.colors.primary}
        minimumTrackTintColor={theme.colors.primary}
        //onValueChange={value => onChange(name, value)}
        testID={`${name}-slider`}
      />
      <Text style={styles.settingValue}>
        {Number.isInteger(step)
          ? Math.round(localSliderValues[name] ?? settings[name]).toString()
          : (localSliderValues[name] ?? settings[name]).toFixed(2)}
      </Text>
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
          {name.toUpperCase().replace('_', ' ')}
        </Text>
        <Text style={styles.description}>{l10n[metadata.descriptionKey]}</Text>
        <TextInput
          value={value}
          onChangeText={_value => onChange(name, _value)}
          keyboardType="numeric"
          error={!validation.isValid}
          helperText={validation.errorMessage}
        />
      </View>
    );
  };

  const renderSwitch = (name: string) => (
    <View style={[styles.settingItem, styles.row]}>
      <View>
        <Text variant="labelSmall" style={styles.settingLabel}>
          {name.toUpperCase().replace('_', ' ')}
        </Text>
        <Text style={styles.description}>
          {l10n[COMPLETION_PARAMS_METADATA[name]?.descriptionKey]}
        </Text>
      </View>
      <Switch
        value={settings[name]}
        onValueChange={value => onChange(name, value)}
        testID={`${name}-switch`}
      />
    </View>
  );

  const renderStopWords = () => (
    <View style={styles.settingItem}>
      <View style={styles.stopLabel}>
        <Text variant="labelSmall" style={styles.settingLabel}>
          STOP WORDS
        </Text>
      </View>

      {/* Display existing stop words as chips */}
      <View style={styles.stopWordsContainer}>
        {(settings.stop ?? []).map((word, index) => (
          <Chip
            key={index}
            onClose={() => {
              const newStops = (settings.stop ?? []).filter(
                (_, i) => i !== index,
              );
              onChange('stop', newStops);
            }}
            compact
            textStyle={styles.stopChipText}
            style={styles.stopChip}>
            {word}
          </Chip>
        ))}
      </View>

      {/* Input for new stop words */}
      <TextInput
        value={newStopWord}
        placeholder="Add new stop word"
        onChangeText={setNewStopWord}
        onSubmitEditing={() => {
          if (newStopWord.trim()) {
            onChange('stop', [...(settings.stop ?? []), newStopWord.trim()]);
            setNewStopWord('');
          }
        }}
        testID="stop-input"
      />
    </View>
  );

  const renderMirostatSelector = () => {
    const descriptionKey = COMPLETION_PARAMS_METADATA.mirostat?.descriptionKey;
    const description = descriptionKey ? l10n[descriptionKey] : '';

    return (
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>Mirostat</Text>
        {description && <Text style={styles.description}>{description}</Text>}
        <SegmentedButtons
          value={(settings.mirostat ?? 0).toString()}
          onValueChange={value => onChange('mirostat', parseInt(value, 10))}
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
    <View>
      {renderIntegerInput({name: 'n_predict'})}
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
      {renderSwitch('penalize_nl')}
      {renderIntegerInput({name: 'seed'})}
      {renderIntegerInput({name: 'n_probs'})}
      {renderStopWords()}
    </View>
  );
};
