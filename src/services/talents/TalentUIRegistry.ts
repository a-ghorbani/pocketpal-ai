import React from 'react';

import {TalentResult} from './types';

export interface TalentUI {
  readonly name: string;
  /** Render the completed result. Receives the typed TalentResult. */
  renderResult?(result: TalentResult): React.ReactNode;
  /** Render a pending/loading state while the talent executes. */
  renderPending?(): React.ReactNode;
}

/**
 * Name-keyed registry for talent UI renderers.
 *
 * Mirrors {@link TalentRegistry} on the UI side: each visual talent registers
 * a `TalentUI` that knows how to render its result and pending state.
 * Text-only talents (calculate, datetime) do not register a TalentUI —
 * TalentSurface renders nothing for them.
 */
export class TalentUIRegistry {
  private uis = new Map<string, TalentUI>();

  register(ui: TalentUI): void {
    this.uis.set(ui.name, ui);
  }

  get(name: string): TalentUI | undefined {
    return this.uis.get(name);
  }

  has(name: string): boolean {
    return this.uis.has(name);
  }

  /** Test helper: clear all registered UIs. */
  reset(): void {
    this.uis.clear();
  }
}

export const talentUIRegistry = new TalentUIRegistry();
