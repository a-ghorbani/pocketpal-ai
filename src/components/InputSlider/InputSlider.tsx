import React, {useState, useEffect, useCallback, useRef} from 'react';
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
  /** Debounce delay in milliseconds for onValueChange. Default: 300ms. Set to 0 to disable debouncing. */
  debounceMs?: number;
  /** Optional callback for immediate value changes (not debounced) */
  onImmediateChange?: (value: number) => void;
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
  debounceMs = 300,
  onImmediateChange,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const [textValue, setTextValue] = useState(value.toString());
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

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
    setTextValue(prev => {
      if (parseFloat(prev) !== value) {
        return clamp(value).toString();
      }
      return prev;
    });
  }, [value, clamp]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  const handleSliderChange = useCallback(
    (val: number) => {
      const newValue = clamp(val);
      setTextValue(newValue.toString());

      // Call immediate change callback if provided
      onImmediateChange?.(newValue);

      // Handle debounced onValueChange
      if (debounceMs > 0) {
        // Clear existing timeout
        if (debounceTimeout.current) {
          clearTimeout(debounceTimeout.current);
        }

        // Set new timeout for debounced callback
        debounceTimeout.current = setTimeout(() => {
          onValueChange(newValue);
          debounceTimeout.current = null;
        }, debounceMs);
      } else {
        // No debouncing, call immediately
        onValueChange(newValue);
      }
    },
    [clamp, onValueChange, onImmediateChange, debounceMs],
  );

  const handleTextChange = (text: string) => {
    setTextValue(text);
  };

  const handleEndEditing = useCallback(() => {
    const finalValue = clamp(textValue);
    setTextValue(finalValue.toString());

    // Clear any pending debounced call since we're ending editing
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
      debounceTimeout.current = null;
    }

    // Call immediate change callback if provided
    onImmediateChange?.(finalValue);

    // Always call onValueChange immediately when text editing ends
    onValueChange(finalValue);
  }, [clamp, textValue, onValueChange, onImmediateChange]);

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
            thumbTintColor={
              disabled ? theme.colors.outline : theme.colors.primary
            }
            minimumTrackTintColor={
              disabled ? theme.colors.outline : theme.colors.primary
            }
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
            testID={`${testID}-input`}
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
