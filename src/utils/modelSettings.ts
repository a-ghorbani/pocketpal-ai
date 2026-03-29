import {CompletionParams} from './completionTypes';
import {defaultCompletionParams} from './completionSettingsVersions';

export const LEGACY_QUANTIZATION_WARNINGS = [
  'Q4_0_4_8',
  'Q4_0_4_4',
  'Q4_0_8_8',
];

export const isLegacyQuantization = (filename: string): boolean => {
  return LEGACY_QUANTIZATION_WARNINGS.some(q =>
    filename.toLowerCase().includes(q.toLowerCase()),
  );
};

export type ValidationRule =
  | {type: 'numeric'; min?: number; max?: number; required?: boolean}
  | {type: 'array'; required?: boolean}
  | {type: 'boolean'; required?: boolean};

export interface CompletionParamMetadata {
  validation: ValidationRule;
  defaultValue: number | boolean | string[] | null | undefined;
}

export const COMPLETION_PARAMS_METADATA: Partial<
  Record<keyof CompletionParams, CompletionParamMetadata>
> = {
  n_threads: {
    // TODO: get number of cores from device
    validation: {type: 'numeric', min: 1, max: 16, required: true},
    defaultValue: defaultCompletionParams.n_threads,
  },
  n_predict: {
    validation: {type: 'numeric', min: 1, required: true},
    defaultValue: defaultCompletionParams.n_predict,
  },
  temperature: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.temperature,
  },
  top_k: {
    validation: {type: 'numeric', min: 1, max: 128, required: true},
    defaultValue: defaultCompletionParams.top_k,
  },
  top_p: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.top_p,
  },
  min_p: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.min_p,
  },
  xtc_threshold: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.xtc_threshold,
  },
  xtc_probability: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.xtc_probability,
  },
  typical_p: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.typical_p,
  },
  penalty_last_n: {
    validation: {type: 'numeric', min: 0, max: 256, required: true},
    defaultValue: defaultCompletionParams.penalty_last_n,
  },
  penalty_repeat: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.penalty_repeat,
  },
  penalty_freq: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.penalty_freq,
  },
  penalty_present: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.penalty_present,
  },
  mirostat: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.mirostat,
  },
  mirostat_tau: {
    validation: {type: 'numeric', min: 0, max: 10, required: true},
    defaultValue: defaultCompletionParams.mirostat_tau,
  },
  mirostat_eta: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.mirostat_eta,
  },
  seed: {
    validation: {
      type: 'numeric',
      min: -1,
      max: Number.MAX_SAFE_INTEGER,
      required: true,
    },
    defaultValue: defaultCompletionParams.seed,
  },
  n_probs: {
    validation: {type: 'numeric', min: 0, max: 100, required: true},
    defaultValue: defaultCompletionParams.n_probs,
  },
  stop: {
    validation: {type: 'array', required: false},
    defaultValue: defaultCompletionParams.stop,
  },
  include_thinking_in_context: {
    validation: {type: 'boolean', required: false},
    defaultValue: defaultCompletionParams.include_thinking_in_context,
  },
  jinja: {
    validation: {type: 'boolean', required: false},
    defaultValue: defaultCompletionParams.jinja,
  },
};

// Validation helpers
export const validateNumericField = (
  value: string | number,
  rule: ValidationRule,
): {isValid: boolean; errorMessage?: string} => {
  if (rule.type !== 'numeric') {
    return {isValid: true};
  }

  if (value === undefined || value === null || value === '') {
    return rule.required
      ? {
          isValid: false,
          errorMessage: 'This field is required',
        }
      : {isValid: true};
  }

  if (typeof value === 'string' && !/^-?\d*\.?\d*$/.test(value)) {
    return {isValid: false, errorMessage: 'Please enter a valid number'};
  }

  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

  if (Number.isNaN(numValue)) {
    return {isValid: false, errorMessage: 'Please enter a valid number'};
  }

  const isBelowMin = rule.min !== undefined && numValue < rule.min;
  const isAboveMax = rule.max !== undefined && numValue > rule.max;
  const isValid = !isBelowMin && !isAboveMax;

  let errorMessage: string | undefined;
  if (!isValid) {
    if (rule.min !== undefined && rule.max !== undefined) {
      errorMessage = `Value must be between ${rule.min} and ${rule.max}`;
    } else if (rule.min !== undefined) {
      errorMessage = `Value must be at least ${rule.min}`;
    } else if (rule.max !== undefined) {
      errorMessage = `Value must be at most ${rule.max}`;
    } else {
      errorMessage = 'Please enter a valid number';
    }
  }

  return {
    isValid,
    errorMessage,
  };
};

export const validateCompletionSettings = (
  settings: Partial<CompletionParams>,
): {
  isValid: boolean;
  errors: Record<string, string>;
} => {
  const errors: Record<string, string> = {};

  Object.entries(COMPLETION_PARAMS_METADATA).forEach(([key, metadata]) => {
    if (key in settings && metadata) {
      const validationResult = validateNumericField(
        settings[key],
        metadata.validation,
      );
      const rule = metadata.validation;
      if (
        rule.type === 'numeric' &&
        !validationResult.isValid &&
        validationResult.errorMessage
      ) {
        errors[key] = validationResult.errorMessage;
      }
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
