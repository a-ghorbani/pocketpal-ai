import {
  Model,
  ModelOrigin,
  RemoteModelCaps,
  RemoteSessionBinding,
} from './types';

/**
 * Whether stored capabilities describe the backend the live session is bound
 * to. Caps carry the url they were probed against; the session carries the url
 * it was built with. A server edit moves neither, so this is the only
 * comparison that answers "do these describe what we are talking to".
 *
 * No binding (or one for another model) means there is no live session to
 * contradict, and an entry with no `probedUrl` predates the field — both are
 * taken at face value.
 */
export function capsMatchBinding(
  caps: RemoteModelCaps | undefined,
  binding: RemoteSessionBinding | undefined,
  modelId: string,
): boolean {
  if (!caps) {
    return false;
  }
  if (!binding || binding.modelId !== modelId) {
    return true;
  }
  return caps.probedUrl === undefined || caps.probedUrl === binding.url;
}

/**
 * Resolve the effective capabilities of a remote model. Single source of truth
 * for both the chat UI and the send path, so the attach affordance and
 * isMultimodalEnabled can never disagree.
 *
 * Pure and synchronous by design: callers resolve inside an `observer` render
 * body, so a capability landing from a detached probe re-renders on its own.
 *
 * Capabilities that describe a different backend than the session is bound to
 * resolve to unknown, which fails closed.
 */
export function resolveRemoteCaps(
  model: Model | undefined,
  remoteCaps: Record<string, RemoteModelCaps>,
  binding: RemoteSessionBinding | undefined,
): RemoteModelCaps {
  if (!model || model.origin !== ModelOrigin.REMOTE) {
    return {};
  }

  const perModel = remoteCaps[model.id];
  if (!capsMatchBinding(perModel, binding, model.id)) {
    return {};
  }

  const resolved: RemoteModelCaps = {};
  if (perModel.contextLength !== undefined) {
    resolved.contextLength = perModel.contextLength;
  }
  if (perModel.supportsVision !== undefined) {
    resolved.supportsVision = perModel.supportsVision;
  }
  return resolved;
}
