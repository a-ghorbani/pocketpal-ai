import React, {useState, useEffect, useCallback} from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';
import {useTheme} from '../../hooks';
import Slider from '@react-native-community/slider';
import {createStyles} from './styles';
import {TextInput} from '../TextInput';
import {VariantProp} from 'react-native-paper/lib/typescript/components/Typography/types';

interface InputSliderProps {
  label?: string;
  labelVariant?: VariantProp<string>;
  description?: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  showInput?: boolean;
  disabled?: boolean;
  showRangeLabel?: boolean;
  unit?: string;
  testID?: string;
}

export const InputSlider: React.FC<InputSliderProps> = ({
  label,
  labelVariant = 'titleMedium',
  description,
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0,
  precision = 0,
  showInput = true,
  disabled = false,
  showRangeLabel = false,
  unit = '',
  testID,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const [textValue, setTextValue] = useState(value.toString());

  const clamp = useCallback(
    (val: number | string): number => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      if (isNaN(num)) {
        return min;
      }
      const clamped = Math.min(max, Math.max(min, num));
      return parseFloat(clamped.toFixed(precision));
    },
    [min, max, precision],
  );

  useEffect(() => {
    if (parseFloat(textValue) !== value) {
      setTextValue(clamp(value).toString());
    }
  }, [textValue, value, clamp]);

  const handleSliderChange = (val: number) => {
    const newValue = clamp(val);
    onValueChange(newValue);
    setTextValue(newValue.toString());
  };

  const handleTextChange = (text: string) => {
    setTextValue(text);
    const num = parseFloat(text);
    if (!isNaN(num)) {
      onValueChange(clamp(num));
    }
  };

  const handleEndEditing = () => {
    const finalValue = clamp(textValue);
    onValueChange(finalValue);
    setTextValue(finalValue.toString());
  };

  return (
    <View>
      {label && (
        <Text variant={labelVariant} style={styles.label}>
          {label}
        </Text>
      )}
      {description && <Text style={styles.description}>{description}</Text>}
      <View style={styles.controlRow}>
        <View style={styles.sliderContainer}>
          <Slider
            testID={testID}
            style={styles.slider}
            minimumValue={min}
            maximumValue={max}
            step={step}
            value={value}
            onValueChange={handleSliderChange}
            thumbTintColor={theme.colors.primary}
            minimumTrackTintColor={theme.colors.primary}
            disabled={disabled}
          />

          {showRangeLabel && (
            <View style={styles.rangeContainer}>
              <Text style={styles.rangeLabel}>
                {min}
                {unit}
              </Text>
              <Text style={styles.rangeLabel}>
                {max}
                {unit}
              </Text>
            </View>
          )}
        </View>

        {showInput && (
          <TextInput
            style={[styles.textInput, disabled && styles.disabledTextInput]}
            value={textValue}
            onChangeText={handleTextChange}
            onBlur={handleEndEditing}
            onSubmitEditing={handleEndEditing}
            onEndEditing={handleEndEditing}
            keyboardType="numeric"
            editable={!disabled}
            selectTextOnFocus={!disabled}
          />
        )}
      </View>
    </View>
  );
};
