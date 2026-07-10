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

/**
 * Canonical axis-2 effort levels, in pill-cycle order from lowest to highest
 * intensity. The universal set across reasoning families that grade effort; a
 * model may support a subset. `effortValues` is always stored in this order so
 * the pill cycles consistently.
 */
export const EFFORT_LEVELS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/**
 * Standard subset pre-selected the first time a user enables graded effort on
 * a model — gives the chips an immediate selected/unselected contrast (instead
 * of an all-blank row that doesn't read as togglable) and a sensible default.
 */
export const DEFAULT_EFFORT_VALUES: string[] = ['low', 'medium', 'high'];

/** Order an effort-level selection canonically (lowest→highest intensity). */
export function orderEffortValues(values: string[]): string[] {
  return EFFORT_LEVELS.filter(level => values.includes(level));
}

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
