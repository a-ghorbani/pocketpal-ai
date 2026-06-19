/**
 * Effective reasoning capability for a model, kept as two independent axes.
 *
 * Axis 1 (`isReasoning` / `source`) — whether the model reasons at all; drives
 * pill visibility and the on/off state.
 * Axis 2 (`supportsEffort` / `effortValues` / `effortSource`) — whether the pill
 * grades to low/medium/high and the value set. Present only when axis 1 ≠ 'no'.
 *
 * Provenance precedence is user > learned > detected > unknown; a `source: 'user'`
 * declaration is never downgraded by detection or learn-from-stream.
 */
export interface ReasoningCapability {
  isReasoning: 'yes' | 'no' | 'unknown';
  source: 'user' | 'learned' | 'detected' | 'unknown';
  supportsEffort: boolean;
  effortValues: string[];
  effortSource: 'user' | 'detected' | 'none';
}

import {ModelOrigin} from './types';
import type {Model} from './types';

const UNKNOWN: ReasoningCapability = {
  isReasoning: 'unknown',
  source: 'unknown',
  supportsEffort: false,
  effortValues: [],
  effortSource: 'none',
};

/**
 * Resolve the effective reasoning capability for a model. Single source of
 * truth — no component reads `supportsThinking` directly post-migration.
 *
 * Local models read `model.reasoning`; remote models (not persisted) read
 * `remoteReasoning[model.id]`. When neither is present the legacy
 * `supportsThinking` boolean is the fail-open fallback: `true` → 'yes',
 * `false` → 'no', absent → 'unknown'. Axis-2 (effort) is reported only when
 * axis-1 is not 'no'.
 */
export function resolveReasoningCapability(
  model: Model | undefined,
  remoteReasoning: Record<string, ReasoningCapability>,
): ReasoningCapability {
  if (!model) {
    return UNKNOWN;
  }

  const stored =
    model.origin === ModelOrigin.REMOTE
      ? remoteReasoning[model.id]
      : model.reasoning;

  let resolved: ReasoningCapability;
  if (stored) {
    resolved = stored;
  } else if (model.supportsThinking === true) {
    resolved = {...UNKNOWN, isReasoning: 'yes', source: 'detected'};
  } else if (model.supportsThinking === false) {
    resolved = {...UNKNOWN, isReasoning: 'no', source: 'detected'};
  } else {
    resolved = UNKNOWN;
  }

  // Axis-2 is inert when axis-1 is 'no'.
  if (resolved.isReasoning === 'no') {
    return {
      ...resolved,
      supportsEffort: false,
      effortValues: [],
      effortSource: 'none',
    };
  }
  return resolved;
}
