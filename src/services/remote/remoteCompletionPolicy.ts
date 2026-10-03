import type {StreamChatParams} from '../../api/openai';
import type {ApiCompletionParams} from '../../utils/completionTypes';

export function explicitRemoteGenerationParams(
  params: ApiCompletionParams,
): Partial<StreamChatParams> {
  const modes = params.generationParameterModes;
  return {
    ...(modes?.top_k === 'send' ? {top_k: params.top_k} : {}),
    ...(modes?.min_p === 'send' ? {min_p: params.min_p} : {}),
    ...(modes?.xtc_threshold === 'send'
      ? {xtc_threshold: params.xtc_threshold}
      : {}),
    ...(modes?.xtc_probability === 'send'
      ? {xtc_probability: params.xtc_probability}
      : {}),
    ...(modes?.typical_p === 'send' ? {typical_p: params.typical_p} : {}),
    ...(modes?.penalty_last_n === 'send'
      ? {penalty_last_n: params.penalty_last_n}
      : {}),
    ...(modes?.penalty_repeat === 'send'
      ? {penalty_repeat: params.penalty_repeat}
      : {}),
    ...(modes?.penalty_freq === 'send'
      ? {penalty_freq: params.penalty_freq}
      : {}),
    ...(modes?.penalty_present === 'send'
      ? {penalty_present: params.penalty_present}
      : {}),
    ...(modes?.mirostat === 'send' ? {mirostat: params.mirostat} : {}),
    ...(modes?.mirostat_tau === 'send'
      ? {mirostat_tau: params.mirostat_tau}
      : {}),
    ...(modes?.mirostat_eta === 'send'
      ? {mirostat_eta: params.mirostat_eta}
      : {}),
    ...(modes?.seed === 'send' ? {seed: params.seed} : {}),
    ...(modes?.n_probs === 'send' ? {n_probs: params.n_probs} : {}),
    ...(modes?.jinja === 'send' ? {jinja: params.jinja} : {}),
    ...(modes?.enable_thinking === 'send'
      ? {enable_thinking: params.enable_thinking}
      : {}),
  };
}
