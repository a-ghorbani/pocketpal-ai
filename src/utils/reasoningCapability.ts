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
