import type {
  CompletionParams,
  GenerationParameterMode,
  GenerationParameterModes,
  OptionalGenerationParameter,
} from './completionTypes';
import {OPTIONAL_GENERATION_PARAMETER_KEYS} from './completionTypes';

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function modeFor(
  modes: GenerationParameterModes | undefined,
  key: OptionalGenerationParameter,
): GenerationParameterMode | undefined {
  return modes?.[key];
}

function restoreInheritedValue(
  target: CompletionParams,
  inherited: CompletionParams,
  key: OptionalGenerationParameter,
): void {
  if (key === 'reasoning_effort') {
    const inheritedReasoning = inherited.reasoning;
    const targetReasoning = target.reasoning;
    if (inheritedReasoning?.effort !== undefined) {
      target.reasoning = {
        enabled: targetReasoning?.enabled ?? inheritedReasoning.enabled,
        effort: inheritedReasoning.effort,
      };
    } else if (targetReasoning) {
      const withoutEffort = {...targetReasoning};
      delete withoutEffort.effort;
      target.reasoning = withoutEffort;
    }
    return;
  }

  if (hasOwn(inherited, key)) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value: inherited[key],
      writable: true,
    });
  } else {
    Reflect.deleteProperty(target, key);
  }
}

function layerDefinesValue(
  layer: CompletionParams,
  key: OptionalGenerationParameter,
): boolean {
  return key === 'reasoning_effort'
    ? layer.reasoning?.effort !== undefined
    : hasOwn(layer, key);
}

/**
 * Resolves persisted settings in precedence order while keeping mode intent
 * separate from retained values. A layer's `inherit` mode leaves both the
 * inherited effective value and inherited effective mode unchanged.
 */
export function mergeCompletionParameterLayers(
  ...layers: ReadonlyArray<CompletionParams | undefined>
): CompletionParams {
  let resolved: CompletionParams = {};
  let effectiveModes: GenerationParameterModes = {};

  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    const inherited = resolved;
    const next: CompletionParams = {
      ...resolved,
      ...layer,
    };

    for (const key of OPTIONAL_GENERATION_PARAMETER_KEYS) {
      const layerMode = modeFor(layer.generationParameterModes, key);
      if (layerMode === 'inherit') {
        restoreInheritedValue(next, inherited, key);
        continue;
      }
      if (layerMode === 'send' || layerMode === 'omit') {
        effectiveModes = {...effectiveModes, [key]: layerMode};
        continue;
      }
      if (layerDefinesValue(layer, key)) {
        const remainingModes = {...effectiveModes};
        delete remainingModes[key];
        effectiveModes = remainingModes;
      }
    }
    if (Object.keys(effectiveModes).length > 0) {
      next.generationParameterModes = {...effectiveModes};
    } else {
      delete next.generationParameterModes;
    }
    resolved = next;
  }

  return resolved;
}

interface GenerationModeApplicable {
  generationParameterModes?: GenerationParameterModes;
  reasoning?: {enabled?: boolean; effort?: string};
  reasoning_format?: 'none' | 'auto' | 'deepseek';
  reasoning_effort?: string;
  chat_template_kwargs?: Record<string, string | number | boolean>;
  n_predict?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  max_output_tokens?: number;
  include?: string[];
  temperature?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  xtc_threshold?: number;
  xtc_probability?: number;
  typical_p?: number;
  penalty_last_n?: number;
  penalty_repeat?: number;
  penalty_freq?: number;
  penalty_present?: number;
  repeat_last_n?: number;
  repeat_penalty?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  seed?: number;
  n_probs?: number;
  stop?: string | string[];
  jinja?: boolean;
  enable_thinking?: boolean;
  include_thinking_in_context?: boolean;
}

function removeChatTemplateKwarg(
  params: GenerationModeApplicable,
  key: string,
): void {
  if (
    !params.chat_template_kwargs ||
    !hasOwn(params.chat_template_kwargs, key)
  ) {
    return;
  }
  const next = {...params.chat_template_kwargs};
  delete next[key];
  if (Object.keys(next).length === 0) {
    delete params.chat_template_kwargs;
  } else {
    params.chat_template_kwargs = next;
  }
}

function omitParameter(
  params: GenerationModeApplicable,
  key: OptionalGenerationParameter,
): void {
  if (key === 'reasoning_effort') {
    if (params.reasoning) {
      const withoutEffort = {...params.reasoning};
      delete withoutEffort.effort;
      if (Object.keys(withoutEffort).length === 0) {
        delete params.reasoning;
      } else {
        params.reasoning = withoutEffort;
      }
    }
    removeChatTemplateKwarg(params, 'reasoning_effort');
    delete params.reasoning_effort;
    return;
  }
  if (key === 'reasoning') {
    delete params.reasoning;
    delete params.reasoning_format;
    delete params.reasoning_effort;
    delete params.include;
    removeChatTemplateKwarg(params, 'reasoning_effort');
    removeChatTemplateKwarg(params, 'enable_thinking');
    return;
  }
  if (key === 'enable_thinking') {
    delete params.enable_thinking;
    removeChatTemplateKwarg(params, 'enable_thinking');
    return;
  }
  if (key === 'n_predict') {
    delete params.n_predict;
    delete params.max_tokens;
    delete params.max_completion_tokens;
    delete params.max_output_tokens;
    return;
  }
  if (key === 'penalty_last_n') {
    delete params.penalty_last_n;
    delete params.repeat_last_n;
    return;
  }
  if (key === 'penalty_repeat') {
    delete params.penalty_repeat;
    delete params.repeat_penalty;
    return;
  }
  if (key === 'penalty_freq') {
    delete params.penalty_freq;
    delete params.frequency_penalty;
    return;
  }
  if (key === 'penalty_present') {
    delete params.penalty_present;
    delete params.presence_penalty;
    return;
  }
  Reflect.deleteProperty(params, key);
}

/**
 * Applies the resolved policy to a clone. Explicit `omit` (and an unresolved
 * `inherit`) deletes the property and its derived aliases. `send` deliberately
 * retains valid falsy and sentinel values.
 */
export function applyGenerationParameterModes<
  T extends GenerationModeApplicable,
>(params: T): T {
  const resolved: T = {
    ...params,
  };
  if (params.reasoning) {
    resolved.reasoning = {...params.reasoning};
  }
  if (params.chat_template_kwargs) {
    resolved.chat_template_kwargs = {...params.chat_template_kwargs};
  }
  const modes = params.generationParameterModes;
  delete resolved.generationParameterModes;

  for (const key of OPTIONAL_GENERATION_PARAMETER_KEYS) {
    const mode = modeFor(modes, key);
    if (mode === 'omit' || mode === 'inherit') {
      omitParameter(resolved, key);
    }
  }
  return resolved;
}
