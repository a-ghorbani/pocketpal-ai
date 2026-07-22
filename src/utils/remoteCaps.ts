import {Model, ModelOrigin, RemoteModelCaps, ServerConfig} from './types';

/**
 * Resolve the effective capabilities of a remote model. Single source of truth
 * for both the chat UI and the send path, so the attach affordance and
 * isMultimodalEnabled can never disagree.
 *
 * Pure and synchronous by design: callers resolve inside an `observer` render
 * body, so a capability landing from a detached probe re-renders on its own.
 *
 * Per-model caps win. The per-server fields are pre-per-model leftovers with no
 * writer left; they are read only as a fallback, and a persisted context length
 * of 0 is ignored because it came from a router placeholder, not a real window.
 */
export function resolveRemoteCaps(
  model: Model | undefined,
  remoteCaps: Record<string, RemoteModelCaps>,
  servers: ServerConfig[],
): RemoteModelCaps {
  if (!model || model.origin !== ModelOrigin.REMOTE) {
    return {};
  }

  const perModel = remoteCaps[model.id];
  const server = servers.find(s => s.id === model.serverId);

  const resolved: RemoteModelCaps = {};

  const legacyContextLength =
    typeof server?.contextLength === 'number' &&
    Number.isFinite(server.contextLength) &&
    server.contextLength > 0
      ? server.contextLength
      : undefined;
  const contextLength = perModel?.contextLength ?? legacyContextLength;
  if (contextLength !== undefined) {
    resolved.contextLength = contextLength;
  }

  const supportsVision = perModel?.supportsVision ?? server?.supportsVision;
  if (supportsVision !== undefined) {
    resolved.supportsVision = supportsVision;
  }

  return resolved;
}
