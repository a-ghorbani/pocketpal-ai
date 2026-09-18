import {defaultCompletionParams} from './completionSettingsVersions';
import type {CompletionParams} from './completionTypes';
import {finiteNumber} from './finite';

/**
 * Every numeric completion control the app can forward, under the app's own
 * names. A wire name belongs to a server profile's send map, never here.
 */
export const SAMPLER_PARAMS = [
  'temperature',
  'top_p',
  'top_k',
  'min_p',
  'typical_p',
  'xtc_threshold',
  'xtc_probability',
  'penalty_last_n',
  'penalty_repeat',
  'penalty_freq',
  'penalty_present',
  'mirostat',
  'mirostat_tau',
  'mirostat_eta',
  'seed',
  'n_predict',
  'n_probs',
] as const satisfies readonly (keyof CompletionParams)[];

export type SamplerParam = (typeof SAMPLER_PARAMS)[number];

export type Samplers = Partial<Record<SamplerParam, number>>;

/**
 * The three a remote server has always been sent, whatever they hold. The
 * app's own temperature default is 0.7 where OpenAI's is 1.0, so leaving one
 * of these out at the app default would change what runs, not preserve it.
 */
const ALWAYS_SENT: readonly SamplerParam[] = [
  'temperature',
  'top_p',
  'n_predict',
];

/**
 * The stored value that leaves this sampler to the server, or `undefined` when
 * the app sends the sampler regardless. Forwarding a sampler overrides whatever
 * the server was launched with, so a control the user never moved off the app
 * default stays off the wire and the server's own value applies.
 *
 * The comparison is exact: a stored value is either the app's own default
 * literal or a number the editor rounded to its control's step, and a surface
 * that showed a wider band than this would promise an omission that does not
 * happen.
 */
export function valueLeftToServer(param: SamplerParam): number | undefined {
  return ALWAYS_SENT.includes(param)
    ? undefined
    : finiteNumber(defaultCompletionParams[param]);
}

export function pickSamplers(params: CompletionParams): Samplers {
  const samplers: Samplers = {};
  for (const param of SAMPLER_PARAMS) {
    const value = finiteNumber(params[param]);
    if (value !== undefined && value !== valueLeftToServer(param)) {
      samplers[param] = value;
    }
  }
  return samplers;
}
