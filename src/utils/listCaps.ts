import type {RemoteModelInfo} from '../api/openai';
import type {ServerConfig} from './types';

/**
 * What a `GET /v1/models` row already says about a model, before anything is
 * activated or probed. Weaker than a probe: the fields describe how the server
 * was configured, not what a loaded session reports.
 *
 * The required `tier` makes this and `RemoteModelCaps` mutually non-assignable,
 * so "a list answer can never be mistaken for a confirmed one" is a compile
 * error rather than a rule to remember.
 */
export interface ListDerivedCaps {
  tier: 'list';
  supportsVision?: boolean;
  // Declared so the resolver can read it; nothing derives it yet.
  supportsAudio?: boolean;
  contextLength?: number;
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

/**
 * Read a models-list row for capabilities. Pure, and never a default: anything
 * absent, wrongly typed or unparseable yields no field at all, so a caller can
 * tell "this server says no" from "this server did not say".
 *
 * The `serverType` gate lives here rather than at the call sites because the
 * two callers source that type differently, and a gate outside the function is
 * a gate that can disagree with itself.
 */
export function deriveListCaps(
  row: RemoteModelInfo | undefined,
  serverType: string | undefined,
): ListDerivedCaps {
  const caps: ListDerivedCaps = {tier: 'list'};
  if (!row || serverType !== 'llama.cpp') {
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
