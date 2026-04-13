import {defaultCompletionParams} from '../completionSettingsVersions';
import {
  isLegacyQuantization,
  validateNumericField,
  validateCompletionSettings,
  COMPLETION_PARAMS_METADATA,
} from '../modelSettings';

describe('modelSettings', () => {
  describe('isLegacyQuantization', () => {
    it('returns true for filenames containing legacy quantization patterns', () => {
      expect(isLegacyQuantization('model-Q4_0_4_8.gguf')).toBe(true);
      expect(isLegacyQuantization('llama-Q4_0_4_4-v2.gguf')).toBe(true);
      expect(isLegacyQuantization('mistral-Q4_0_8_8.bin')).toBe(true);
      // Test case insensitivity
      expect(isLegacyQuantization('model-q4_0_4_8.gguf')).toBe(true);
    });

    it('returns false for filenames without legacy quantization patterns', () => {
      expect(isLegacyQuantization('model-Q5_K_M.gguf')).toBe(false);
      expect(isLegacyQuantization('llama-Q8_0.gguf')).toBe(false);
      expect(isLegacyQuantization('mistral.bin')).toBe(false);
    });
  });

  describe('validateNumericField', () => {
    const numericRule = {
      type: 'numeric' as const,
      min: 0,
      max: 10,
      required: true,
    };
    const optionalRule = {
      type: 'numeric' as const,
      min: 0,
      max: 10,
      required: false,
    };

    it('validates numbers within range', () => {
      expect(validateNumericField(5, numericRule).isValid).toBe(true);
      expect(validateNumericField(0, numericRule).isValid).toBe(true);
      expect(validateNumericField(10, numericRule).isValid).toBe(true);
      expect(validateNumericField('7', numericRule).isValid).toBe(true);
    });

    it('invalidates numbers outside range', () => {
      expect(validateNumericField(-1, numericRule).isValid).toBe(false);
      expect(validateNumericField(11, numericRule).isValid).toBe(false);
      expect(validateNumericField('-1', numericRule).isValid).toBe(false);
      expect(validateNumericField('11', numericRule).isValid).toBe(false);
    });

    it('handles required fields correctly', () => {
      expect(validateNumericField('', numericRule).isValid).toBe(false);
      expect(validateNumericField('' as any, numericRule).isValid).toBe(false);
      expect(validateNumericField(null as any, numericRule).isValid).toBe(
        false,
      );
    });

    it('handles optional fields correctly', () => {
      expect(validateNumericField('', optionalRule).isValid).toBe(true);
      expect(validateNumericField(undefined as any, optionalRule).isValid).toBe(
        true,
      );
      expect(validateNumericField(null as any, optionalRule).isValid).toBe(
        true,
      );
    });

    it('validates non-numeric strings correctly', () => {
      expect(validateNumericField('abc', numericRule).isValid).toBe(false);
      expect(validateNumericField('5a', numericRule).isValid).toBe(false);
    });

    it('returns appropriate error messages', () => {
      expect(validateNumericField(15, numericRule).errorMessage).toBe(
        'Value must be between 0 and 10',
      );
      expect(validateNumericField('', numericRule).errorMessage).toBe(
        'This field is required',
      );
      expect(validateNumericField('abc', numericRule).errorMessage).toBe(
        'Please enter a valid number',
      );
    });
  });

  describe('validateCompletionSettings', () => {
    it('validates valid settings', () => {
      const validSettings = {
        temperature: 0.7,
        top_k: 40,
        top_p: 0.9,
      };

      const result = validateCompletionSettings(validSettings);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('ignores fields not in COMPLETION_PARAMS_METADATA', () => {
      const settingsWithExtraFields = {
        temperature: 0.7,
        unknownField: 'value',
      };

      const result = validateCompletionSettings(settingsWithExtraFields);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });
  });

  describe('COMPLETION_PARAMS_METADATA', () => {
    it('has default values matching defaultCompletionParams', () => {
      Object.entries(COMPLETION_PARAMS_METADATA).forEach(([key, metadata]) => {
        if (key in defaultCompletionParams) {
          expect(metadata.defaultValue).toBe(defaultCompletionParams[key]);
        }
      });
    });

    it('has valid validation rules', () => {
      Object.values(COMPLETION_PARAMS_METADATA).forEach(metadata => {
        if (metadata.validation.type === 'numeric') {
          if (
            metadata.validation.min !== undefined &&
            metadata.validation.max !== undefined
          ) {
            expect(metadata.validation.min).toBeLessThanOrEqual(
              metadata.validation.max,
            );
          }
        }
      });
    });
  });
});
