import {normaliseTimings} from '../../utils/completionTypes';
import type {
  CompletionTimings,
  ReasoningIntent,
} from '../../utils/completionTypes';
import {finiteNumber} from '../../utils/finite';
import {reasoningBudgetFor} from '../../utils/reasoningCapability';
import type {SamplerParam, Samplers} from '../../utils/samplerParams';
import {toServerType} from '../../utils/serverTypes';
import type {ServerType} from '../../utils/serverTypes';
import type {
  ListDerivedCaps,
  RemoteModelInfo,
  ServerConfig,
} from '../../utils/types';

/** Everything a request needs about where it goes, captured per session. */
export interface RemoteEndpoint {
  url: string;
  remoteModelId: string;
  apiKey?: string;
  timeoutMs?: number;
  serverType: ServerType;
}

/** What the transport reads off a final chunk. */
export interface FinishRead {
  timings?: CompletionTimings;
  tokensEvaluated?: number;
  tokensPredicted?: number;
}

export interface ServerRequest {
  samplers: Samplers;
  reasoning?: ReasoningIntent;
}

/**
 * How one server type is spoken to. Pure description only: a profile performs
 * no I/O, holds no state, and reads no store.
 */
export interface ServerProfile {
  /** Send side. Present = forwarded; the value is the wire name. */
  sendNames: Partial<Record<SamplerParam, string>>;
  /** Every body key beyond the transport's own and the samplers'. Pure. */
  reasoningExtras(
    reasoning: ReasoningIntent | undefined,
  ): Record<string, unknown>;
  /** `GET /props` exists and is worth probing. */
  hasProps: boolean;
  /** Absent = `/v1/models` rows carry no caps worth reading. Pure. */
  readListRow?(row: RemoteModelInfo | undefined): ListDerivedCaps;
}

/**
 * The three names every OpenAI-compatible server answers to. `n_predict` is
 * ours; `max_completion_tokens` is the wire's.
 */
const BASE_SEND_NAMES = {
  temperature: 'temperature',
  top_p: 'top_p',
  n_predict: 'max_completion_tokens',
} as const;

/**
 * The four `penalty_*` renames are the wire's names, not ours: llama-server
 * accepts an unknown key with a 200 and ignores it, so under our own spelling
 * the sampler silently keeps its default.
 */
const LLAMA_CPP_SEND_NAMES = {
  ...BASE_SEND_NAMES,
  top_k: 'top_k',
  min_p: 'min_p',
  typical_p: 'typical_p',
  xtc_threshold: 'xtc_threshold',
  xtc_probability: 'xtc_probability',
  penalty_last_n: 'repeat_last_n',
  penalty_repeat: 'repeat_penalty',
  penalty_freq: 'frequency_penalty',
  penalty_present: 'presence_penalty',
  mirostat: 'mirostat',
  mirostat_tau: 'mirostat_tau',
  mirostat_eta: 'mirostat_eta',
  seed: 'seed',
  n_probs: 'n_probs',
} as const;

const noReasoningExtras = (): Record<string, unknown> => ({});

/**
 * `reasoning_format` is always `'auto'`: a no-op for non-reasoning models and
 * the value that extracts reasoning into `reasoning_content` instead of leaking
 * raw channel/think markers into content (e.g. gemma-4 emits an empty
 * `<|channel>thought` block even when thinking is off). On/off is carried
 * solely by `enable_thinking`. An effort that is not a level sends no budget,
 * which leaves the server's own default in force.
 */
function llamaCppReasoningExtras(
  reasoning: ReasoningIntent | undefined,
): Record<string, unknown> {
  if (!reasoning) {
    return {};
  }
  const {enabled, effort} = reasoning;
  if (!enabled) {
    return {
      reasoning_format: 'auto',
      chat_template_kwargs: {enable_thinking: false},
    };
  }
  if (!effort) {
    return {reasoning_format: 'auto'};
  }
  const budget = reasoningBudgetFor(effort);
  return {
    reasoning_format: 'auto',
    chat_template_kwargs: {reasoning_effort: effort},
    ...(budget !== undefined && {reasoning_budget_tokens: budget}),
  };
}

/** On/off only: the LM Studio chat API ignores `reasoning_effort`. */
function lmStudioReasoningExtras(
  reasoning: ReasoningIntent | undefined,
): Record<string, unknown> {
  if (!reasoning || reasoning.enabled) {
    return {};
  }
  return {chat_template_kwargs: {enable_thinking: false}};
}

/**
 * Ollama's `/v1` surface takes `reasoning_effort: 'none'` as a safe no-op for
 * OFF. It never takes `think: true` and never a non-`'none'` effort: both are a
 * hard 400 on a model with no thinking support. Graded effort is deferred.
 */
function ollamaReasoningExtras(
  reasoning: ReasoningIntent | undefined,
): Record<string, unknown> {
  if (!reasoning || reasoning.enabled) {
    return {};
  }
  return {reasoning_effort: 'none'};
}

/**
 * `reasoning_effort` carries the effort the caller resolved for the model id;
 * on/off alone sends nothing, because a reasoning parameter on a model that has
 * none is a 400.
 */
function openaiReasoningExtras(
  reasoning: ReasoningIntent | undefined,
): Record<string, unknown> {
  return reasoning?.effort ? {reasoning_effort: reasoning.effort} : {};
}

/**
 * Modern vLLM ignores an unknown `chat_template_kwargs` entry, so both keys are
 * safe. Its sampler names are its own (`repetition_penalty`, not
 * `repeat_penalty`), so none is forwarded until one has been read back off a
 * live server.
 */
function vllmReasoningExtras(
  reasoning: ReasoningIntent | undefined,
): Record<string, unknown> {
  if (!reasoning) {
    return {};
  }
  const {enabled, effort} = reasoning;
  if (!enabled) {
    return {chat_template_kwargs: {enable_thinking: false}};
  }
  return effort ? {chat_template_kwargs: {reasoning_effort: effort}} : {};
}

const CONTEXT_FLAGS = ['--ctx-size', '-c'];

const positiveInt = (raw: string | undefined): number | undefined => {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const value = parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

/**
 * The launch window, from the last `--ctx-size`/`-c` in either the
 * `--ctx-size 8192` or `--ctx-size=8192` form. Last occurrence wins, matching
 * the server's own argument handling. No other argument is read.
 *
 * `--ctx-size 0` means "use the model's trained window", which is not a window
 * this can report, so it resolves to unknown like every other parse failure.
 */
const contextFromArgs = (args: unknown): number | undefined => {
  if (!Array.isArray(args)) {
    return undefined;
  }
  let found: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string') {
      continue;
    }
    if (CONTEXT_FLAGS.includes(arg)) {
      found = positiveInt(
        typeof args[i + 1] === 'string' ? args[i + 1] : undefined,
      );
      continue;
    }
    const inline = CONTEXT_FLAGS.map(flag => `${flag}=`).find(prefix =>
      arg.startsWith(prefix),
    );
    if (inline) {
      found = positiveInt(arg.slice(inline.length));
    }
  }
  return found;
};

function readLlamaCppListRow(
  row: RemoteModelInfo | undefined,
): ListDerivedCaps {
  const caps: ListDerivedCaps = {tier: 'list'};
  if (!row) {
    return caps;
  }

  const modalities = row.architecture?.input_modalities;
  if (Array.isArray(modalities)) {
    // The array always carries `text`, so a missing `image` is the server
    // answering "no", not failing to answer.
    caps.supportsVision = modalities.includes('image');
  } else if (Array.isArray(row.capabilities)) {
    caps.supportsVision = row.capabilities.includes('multimodal');
  }

  const reported =
    typeof row.meta?.n_ctx === 'number' && Number.isSafeInteger(row.meta.n_ctx)
      ? row.meta.n_ctx
      : undefined;
  // A loaded child's own report beats the command that launched it.
  const contextLength =
    (reported !== undefined && reported > 0 ? reported : undefined) ??
    contextFromArgs(row.status?.args);
  if (contextLength !== undefined) {
    caps.contextLength = contextLength;
  }

  return caps;
}

/**
 * One profile per server type, `'unknown'` included. Total over `ServerType`,
 * so a new type cannot be offered in the UI before it has a profile. The
 * `satisfies` is what keeps each send map's literal names readable from
 * outside — an annotation here would widen them away.
 */
export const SERVER_PROFILES = {
  'llama.cpp': {
    sendNames: LLAMA_CPP_SEND_NAMES,
    reasoningExtras: llamaCppReasoningExtras,
    hasProps: true,
    readListRow: readLlamaCppListRow,
  },
  'LM Studio': {
    sendNames: BASE_SEND_NAMES,
    reasoningExtras: lmStudioReasoningExtras,
    hasProps: false,
  },
  Ollama: {
    sendNames: BASE_SEND_NAMES,
    reasoningExtras: ollamaReasoningExtras,
    hasProps: false,
  },
  OpenAI: {
    sendNames: BASE_SEND_NAMES,
    reasoningExtras: openaiReasoningExtras,
    hasProps: false,
  },
  vLLM: {
    sendNames: BASE_SEND_NAMES,
    reasoningExtras: vllmReasoningExtras,
    hasProps: false,
  },
  unknown: {
    sendNames: BASE_SEND_NAMES,
    reasoningExtras: noReasoningExtras,
    hasProps: false,
  },
} satisfies Record<ServerType, ServerProfile>;

/**
 * The profile for a persisted type. The parameter admits the legacy shapes a
 * stored row can still hold — an empty string, a free string, a case variant,
 * an absent key — and each of those speaks the base, which is what they reach
 * today. A value of another kind is a mistake, not a legacy case, so it is a
 * compile error rather than a silent base profile.
 */
export function profileFor(
  raw: ServerType | string | undefined,
): ServerProfile {
  return SERVER_PROFILES[toServerType(raw)];
}

/**
 * `sendNames[p]: samplers[p]` for every forwarded param holding a finite
 * number. A missing or non-finite value is omitted, never coerced: a server
 * reading JSON `null` for a sampler either 400s or silently defaults.
 */
function sendSamplers(
  sendNames: Partial<Record<SamplerParam, string>>,
  samplers: Samplers,
): Record<string, number> {
  const body: Record<string, number> = {};
  for (const [param, wireName] of Object.entries(sendNames)) {
    const value = finiteNumber(samplers[param as SamplerParam]);
    if (value !== undefined) {
      body[wireName] = value;
    }
  }
  return body;
}

/**
 * Every body key beyond the transport's own, for one server type. Naming a
 * sampler in the send map is what forwards it, so the two cannot disagree.
 */
export function bodyExtras(
  serverType: ServerType | string | undefined,
  {samplers, reasoning}: ServerRequest,
): Record<string, unknown> {
  const profile = profileFor(serverType);
  return {
    ...sendSamplers(profile.sendNames, samplers),
    ...profile.reasoningExtras(reasoning),
  };
}

/**
 * Timings off a final chunk, plus the token counts derived from them — the same
 * read for every server type. The server evaluates only the prompt tokens it
 * did not already hold in its KV cache, so the prompt total is
 * `prompt_n + cache_n`, each key guarded on its own: a build too old to report
 * reuse omits `cache_n`, while a cold prompt on a newer one reports 0, and
 * those are different facts.
 */
export function readFinish(chunk: unknown): FinishRead {
  const timings = normaliseTimings(
    (chunk as {timings?: unknown} | null | undefined)?.timings,
  );
  if (!timings) {
    return {};
  }
  const tokensEvaluated =
    timings.prompt_n !== undefined || timings.cache_n !== undefined
      ? (timings.prompt_n ?? 0) + (timings.cache_n ?? 0)
      : undefined;
  return {timings, tokensEvaluated, tokensPredicted: timings.predicted_n};
}

/**
 * Read a models-list row for capabilities, through the profile of the persisted
 * server type. Pure, and never a default: anything absent, wrongly typed or
 * unparseable yields no field at all, so a caller can tell "this server says
 * no" from "this server did not say".
 */
export function deriveListCaps(
  row: RemoteModelInfo | undefined,
  serverType: ServerType | string | undefined,
): ListDerivedCaps {
  return profileFor(serverType).readListRow?.(row) ?? {tier: 'list'};
}

/**
 * The same derivation for every model of every server, keyed as
 * `${serverId}/${remoteModelId}` — the id a remote `Model` carries.
 */
export function deriveListCapsMap(
  servers: ServerConfig[],
  serverModels: {get(serverId: string): RemoteModelInfo[] | undefined},
): Record<string, ListDerivedCaps> {
  const map: Record<string, ListDerivedCaps> = {};
  for (const server of servers) {
    for (const row of serverModels.get(server.id) ?? []) {
      map[`${server.id}/${row.id}`] = deriveListCaps(row, server.serverType);
    }
  }
  return map;
}
