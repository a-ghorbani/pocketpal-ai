import {
  OPTIONAL_GENERATION_PARAMETER_KEYS,
  type CompletionParams,
} from '../../utils/completionTypes';
import {
  COMPLETION_PARAMS_METADATA,
  validateCompletionSettings,
} from '../../utils/modelSettings';

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export function inheritedCompletionSettings(
  defaults: CompletionParams,
): CompletionParams {
  return {
    ...defaults,
    generationParameterModes: Object.fromEntries(
      OPTIONAL_GENERATION_PARAMETER_KEYS.map(key => [key, 'inherit']),
    ),
  };
}

export function modelCompletionSettingsDraft(
  inherited: CompletionParams,
  raw: CompletionParams,
): CompletionParams {
  return {
    ...inherited,
    ...raw,
    generationParameterModes: Object.fromEntries(
      OPTIONAL_GENERATION_PARAMETER_KEYS.map(key => [
        key,
        raw.generationParameterModes?.[key] ??
          (hasOwn(raw, key) ||
          (key === 'reasoning_effort' && raw.reasoning?.effort !== undefined)
            ? 'send'
            : 'inherit'),
      ]),
    ),
  };
}

export function processCompletionSettingsDraft(
  draft: CompletionParams,
  invalidNumericMessage: string,
): {settings: CompletionParams; errors: Record<string, string>} {
  const settings: Record<string, unknown> = {};
  const conversionErrors: Record<string, string> = {};

  for (const [key, value] of Object.entries(draft)) {
    const metadata = COMPLETION_PARAMS_METADATA[key];
    const mode =
      draft.generationParameterModes?.[
        key as keyof NonNullable<CompletionParams['generationParameterModes']>
      ];
    if (
      metadata?.validation.type !== 'numeric' ||
      mode === 'omit' ||
      mode === 'inherit'
    ) {
      settings[key] = value;
      continue;
    }

    const numericValue = typeof value === 'string' ? Number(value) : value;
    if (typeof numericValue !== 'number' || Number.isNaN(numericValue)) {
      conversionErrors[key] = invalidNumericMessage;
    } else {
      settings[key] = numericValue;
    }
  }

  const processed = settings as CompletionParams;
  return {
    settings: processed,
    errors: {
      ...conversionErrors,
      ...validateCompletionSettings(processed).errors,
    },
  };
}
