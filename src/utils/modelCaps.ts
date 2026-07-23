import {resolveRemoteCaps} from './remoteCaps';
import {ModelOrigin} from './types';
import type {
  ContextInitParams,
  Model,
  RemoteModelCaps,
  RemoteSessionBinding,
} from './types';

/**
 * Effective capabilities of a model, kept as two independent axes.
 *
 * Axis 1 (`vision` / `contextLength`) — what the model declares, independent of
 * load state; describes the model itself, so it is meaningful for any model.
 * Axis 2 (`visionActive` / `effectiveContextLength`) — what the session that
 * exists right now can actually do; meaningful only for the active model.
 *
 * Both length fields are a number > 0 or absent, never 0 — callers do not
 * re-check.
 */
export interface ModelCapabilityView {
  vision: 'yes' | 'no' | 'unknown';
  visionActive: boolean;
  contextLength?: number;
  effectiveContextLength?: number;
}

/** Resolver inputs. Assembled in one place — `ModelStore`. */
export interface CapabilityEnv {
  remoteCaps: Record<string, RemoteModelCaps>;
  binding: RemoteSessionBinding | undefined;
  isMultimodalActive: boolean;
  activeContextSettings: ContextInitParams | undefined;
  activeModelId: string | undefined;
}

const UNKNOWN: ModelCapabilityView = {vision: 'unknown', visionActive: false};

const positive = (value: number | undefined): number | undefined =>
  value !== undefined && value > 0 ? value : undefined;

const triState = (value: boolean | undefined): 'yes' | 'no' | 'unknown' => {
  if (value === undefined) {
    return 'unknown';
  }
  return value ? 'yes' : 'no';
};

/**
 * Resolve the effective capabilities of a model. Single source of truth — the
 * only place `model.origin` is branched on to answer a capability question, so
 * the attach affordance, the send path, the context banner and the model card
 * cannot structurally disagree.
 *
 * Pure and synchronous by design: callers resolve inside an `observer` render
 * body, so a capability landing from a detached probe re-renders on its own.
 */
export function resolveModelCaps(
  model: Model | undefined,
  env: CapabilityEnv,
): ModelCapabilityView {
  if (!model) {
    return UNKNOWN;
  }

  // Context facts describe the live session, so they apply to the active model
  // alone — a card must never borrow another model's load state.
  const isActiveModel = model.id === env.activeModelId;

  if (model.origin === ModelOrigin.REMOTE) {
    const caps = resolveRemoteCaps(model, env.remoteCaps, env.binding);
    const contextLength = positive(caps.contextLength);
    return {
      vision: triState(caps.supportsVision),
      visionActive: isActiveModel && caps.supportsVision === true,
      contextLength,
      effectiveContextLength: isActiveModel ? contextLength : undefined,
    };
  }

  return {
    vision: triState(model.supportsMultimodal),
    visionActive: isActiveModel && env.isMultimodalActive,
    contextLength:
      positive(model.hfModel?.specs?.gguf?.context_length) ??
      positive(model.ggufMetadata?.context_length),
    effectiveContextLength: isActiveModel
      ? positive(env.activeContextSettings?.n_ctx)
      : undefined,
  };
}
