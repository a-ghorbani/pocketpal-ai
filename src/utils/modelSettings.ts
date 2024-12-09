import {CompletionParams} from '@pocketpalai/llama.rn';
import {defaultCompletionParams} from './chat';

export type ValidationRule =
  | {type: 'numeric'; min: number; max: number; required?: boolean}
  | {type: 'array'; required?: boolean}
  | {type: 'boolean'; required?: boolean};

export interface CompletionParamMetadata {
  validation: ValidationRule;
  defaultValue: number | boolean | string[] | null | undefined;
  descriptionKey: string;
}

export const COMPLETION_PARAMS_METADATA: Partial<
  Record<keyof CompletionParams, CompletionParamMetadata>
> = {
  n_threads: {
    // TODO: get number of cores from device
    validation: {type: 'numeric', min: 1, max: 16, required: true},
    defaultValue: defaultCompletionParams.n_threads,
    descriptionKey: 'modelSettings.n_threads',
  },
  n_predict: {
    validation: {type: 'numeric', min: 1, max: 4096, required: true},
    defaultValue: defaultCompletionParams.n_predict,
    descriptionKey: 'modelSettings.n_predict',
  },
  temperature: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.temperature,
    descriptionKey: 'modelSettings.temperature',
  },
  top_k: {
    validation: {type: 'numeric', min: 1, max: 128, required: true},
    defaultValue: defaultCompletionParams.top_k,
    descriptionKey: 'modelSettings.top_k',
  },
  top_p: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.top_p,
    descriptionKey: 'modelSettings.top_p',
  },
  min_p: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.min_p,
    descriptionKey: 'modelSettings.min_p',
  },
  xtc_threshold: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.xtc_threshold,
    descriptionKey: 'modelSettings.xtc_threshold',
  },
  xtc_probability: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.xtc_probability,
    descriptionKey: 'modelSettings.xtc_probability',
  },
  typical_p: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.typical_p,
    descriptionKey: 'modelSettings.typical_p',
  },
  penalty_last_n: {
    validation: {type: 'numeric', min: 0, max: 256, required: true},
    defaultValue: defaultCompletionParams.penalty_last_n,
    descriptionKey: 'modelSettings.penalty_last_n',
  },
  penalty_repeat: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.penalty_repeat,
    descriptionKey: 'modelSettings.penalty_repeat',
  },
  penalty_freq: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.penalty_freq,
    descriptionKey: 'modelSettings.penalty_freq',
  },
  penalty_present: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.penalty_present,
    descriptionKey: 'modelSettings.penalty_present',
  },
  mirostat: {
    validation: {type: 'numeric', min: 0, max: 2, required: true},
    defaultValue: defaultCompletionParams.mirostat,
    descriptionKey: 'modelSettings.mirostat',
  },
  mirostat_tau: {
    validation: {type: 'numeric', min: 0, max: 10, required: true},
    defaultValue: defaultCompletionParams.mirostat_tau,
    descriptionKey: 'modelSettings.mirostat_tau',
  },
  mirostat_eta: {
    validation: {type: 'numeric', min: 0, max: 1, required: true},
    defaultValue: defaultCompletionParams.mirostat_eta,
    descriptionKey: 'modelSettings.mirostat_eta',
  },
  penalize_nl: {
    validation: {type: 'boolean', required: true},
    defaultValue: defaultCompletionParams.penalize_nl,
    descriptionKey: 'modelSettings.penalize_nl',
  },
  seed: {
    validation: {
      type: 'numeric',
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      required: true,
    },
    defaultValue: defaultCompletionParams.seed,
    descriptionKey: 'modelSettings.seed',
  },
  n_probs: {
    validation: {type: 'numeric', min: 0, max: 100, required: true},
    defaultValue: defaultCompletionParams.n_probs,
    descriptionKey: 'modelSettings.n_probs',
  },
  stop: {
    validation: {type: 'array', required: false},
    defaultValue: defaultCompletionParams.stop,
    descriptionKey: 'modelSettings.stop',
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

  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

  if (
    rule.required &&
    (value === undefined || value === null || value === '')
  ) {
    return {
      isValid: false,
      errorMessage: 'This field is required',
    };
  }

  if (isNaN(numValue)) {
    return {
      isValid: !rule.required,
      errorMessage: rule.required ? 'Please enter a valid number' : undefined,
    };
  }

  const isValid = numValue >= rule.min && numValue <= rule.max;
  return {
    isValid,
    errorMessage: isValid
      ? undefined
      : `Value must be between ${rule.min} and ${rule.max}`,
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
    if (
      key in settings &&
      !validateNumericField(settings[key], metadata.validation)
    ) {
      const rule = metadata.validation;
      if (rule.type === 'numeric') {
        errors[key] = `Value must be between ${rule.min} and ${rule.max}`;
      }
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
