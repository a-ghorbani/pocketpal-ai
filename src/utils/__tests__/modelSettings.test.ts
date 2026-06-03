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

    describe('optional bounds', () => {
      const minOnlyRule = {
        type: 'numeric' as const,
        min: -1,
        required: true,
      };
      const maxOnlyRule = {
        type: 'numeric' as const,
        max: 100,
        required: true,
      };
      const noBoundsRule = {
        type: 'numeric' as const,
        required: true,
      };

      it('validates with no max (open-ended) - any value at or above min is valid', () => {
        expect(validateNumericField(0, minOnlyRule).isValid).toBe(true);
        expect(validateNumericField(100000, minOnlyRule).isValid).toBe(true);
        expect(validateNumericField(-1, minOnlyRule).isValid).toBe(true);
        expect(validateNumericField(999999, minOnlyRule).isValid).toBe(true);
      });

      it('returns "Value must be at least {min}" for below-min when no max', () => {
        const result = validateNumericField(-2, minOnlyRule);
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toBe('Value must be at least -1');
      });

      it('validates with no min (open-ended) - any value at or below max is valid', () => {
        expect(validateNumericField(100, maxOnlyRule).isValid).toBe(true);
        expect(validateNumericField(0, maxOnlyRule).isValid).toBe(true);
        expect(validateNumericField(-9999, maxOnlyRule).isValid).toBe(true);
      });

      it('returns "Value must be at most {max}" for above-max when no min', () => {
        const result = validateNumericField(101, maxOnlyRule);
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toBe('Value must be at most 100');
      });

      it('validates with no bounds - any numeric value is valid', () => {
        expect(validateNumericField(-9999, noBoundsRule).isValid).toBe(true);
        expect(validateNumericField(0, noBoundsRule).isValid).toBe(true);
        expect(validateNumericField(9999, noBoundsRule).isValid).toBe(true);
      });

      it('allows -1 for n_predict rule (unlimited generation)', () => {
        const nPredictRule = COMPLETION_PARAMS_METADATA.n_predict!.validation;
        expect(validateNumericField(-1, nPredictRule).isValid).toBe(true);
      });

      it('rejects -2 for n_predict rule (below min -1)', () => {
        const nPredictRule = COMPLETION_PARAMS_METADATA.n_predict!.validation;
        const result = validateNumericField(-2, nPredictRule);
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toBe('Value must be at least -1');
      });

      it('allows 0 for n_predict rule (no generation)', () => {
        const nPredictRule = COMPLETION_PARAMS_METADATA.n_predict!.validation;
        expect(validateNumericField(0, nPredictRule).isValid).toBe(true);
      });

      it('allows large values for n_predict rule (no upper cap)', () => {
        const nPredictRule = COMPLETION_PARAMS_METADATA.n_predict!.validation;
        expect(validateNumericField(100000, nPredictRule).isValid).toBe(true);
      });
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

    it('correctly detects invalid values (bug fix: was silently passing)', () => {
      const invalidSettings = {
        temperature: 999, // max is 2
      };

      const result = validateCompletionSettings(invalidSettings);
      expect(result.isValid).toBe(false);
      expect(result.errors.temperature).toBe('Value must be between 0 and 2');
    });

    it('returns errors for multiple out-of-range values', () => {
      const invalidSettings = {
        temperature: -1, // min is 0
        top_k: 0, // min is 1
        top_p: 2, // max is 1
      };

      const result = validateCompletionSettings(invalidSettings);
      expect(result.isValid).toBe(false);
      expect(Object.keys(result.errors)).toHaveLength(3);
      expect(result.errors.temperature).toBeDefined();
      expect(result.errors.top_k).toBeDefined();
      expect(result.errors.top_p).toBeDefined();
    });

    it('validates n_predict=-1 as valid (unlimited)', () => {
      const settings = {
        n_predict: -1,
      };

      const result = validateCompletionSettings(settings);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('detects n_predict=-2 as invalid', () => {
      const settings = {
        n_predict: -2,
      };

      const result = validateCompletionSettings(settings);
      expect(result.isValid).toBe(false);
      expect(result.errors.n_predict).toBe('Value must be at least -1');
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

    it('has n_predict metadata with min=-1 and no max', () => {
      const nPredictMetadata = COMPLETION_PARAMS_METADATA.n_predict!;
      expect(nPredictMetadata.validation.type).toBe('numeric');
      if (nPredictMetadata.validation.type === 'numeric') {
        expect(nPredictMetadata.validation.min).toBe(-1);
        expect(nPredictMetadata.validation.max).toBeUndefined();
        expect(nPredictMetadata.validation.required).toBe(true);
      }
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
