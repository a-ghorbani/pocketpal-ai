import React from 'react';

import {talentUIRegistry} from '../../services/talents/TalentUIRegistry';
import type {TalentResult} from '../../services/talents/types';

interface TalentSurfaceProps {
  metadata?: Record<string, any>;
}

/**
 * Pure rendering component that delegates talent output to registered TalentUI
 * renderers via {@link talentUIRegistry}.
 *
 * Two-phase lookup:
 * 1. **Result phase** — if `talentCalls` is present, iterate all calls, look up
 *    results by call ID (`tc.id`) and UI renderers by talent name.
 * 2. **Pending phase** — if `pendingTalentNames` has entries but no talentCalls
 *    yet (early streaming), show talent-specific pending UI for talents with
 *    a registered `renderPending`. Others rely on the thinking bubble.
 */
export const TalentSurface: React.FC<TalentSurfaceProps> = ({metadata}) => {
  if (!metadata) {
    return null;
  }

  const talentCalls = metadata.talentCalls as
    | Array<{function: {name: string}; id: string}>
    | undefined;
  const talentResults = metadata.talentResults as
    | Record<string, TalentResult>
    | undefined;
  const pendingTalentNames = metadata.pendingTalentNames as
    | string[]
    | undefined;

  // Result phase: iterate all talent calls
  if (talentCalls && talentCalls.length > 0) {
    const rendered: React.ReactNode[] = [];

    for (const tc of talentCalls) {
      const name = tc.function.name;
      const ui = talentUIRegistry.get(name);
      if (!ui) {
        continue;
      }

      // Look up result by call ID (unique per call), UI renderer by talent name
      const result = talentResults?.[tc.id];
      if (result && ui.renderResult) {
        const node = ui.renderResult(result);
        if (node != null) {
          rendered.push(<React.Fragment key={tc.id}>{node}</React.Fragment>);
          continue;
        }
      }

      // Per-talent pending
      if (pendingTalentNames?.includes(name) && ui.renderPending) {
        rendered.push(
          <React.Fragment key={tc.id}>{ui.renderPending()}</React.Fragment>,
        );
      }
    }

    if (rendered.length > 0) {
      return <>{rendered}</>;
    }
    return null;
  }

  // Pending phase: no talentCalls yet (early streaming).
  // Only show pending UI for talents that have a registered renderPending
  // (e.g., render_html shows "Generating Preview..."). Talents without
  // custom pending UI (calculate, datetime) rely on the thinking bubble.
  if (pendingTalentNames && pendingTalentNames.length > 0) {
    const specific = pendingTalentNames
      .map((name, idx) => {
        const ui = talentUIRegistry.get(name);
        if (ui?.renderPending) {
          return (
            <React.Fragment key={pendingTalentNames[idx]}>
              {ui.renderPending()}
            </React.Fragment>
          );
        }
        return null;
      })
      .filter(Boolean);
    if (specific.length > 0) {
      return <>{specific}</>;
    }
  }

  return null;
};
