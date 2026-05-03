import React, {useContext} from 'react';
import {Text, View} from 'react-native';

import {talentUIRegistry} from '../../services/talents/TalentUIRegistry';
import {L10nContext} from '../../utils';
import {AgentStep} from '../../utils/types';

import {styles} from './styles';

interface TalentSurfaceProps {
  /**
   * Persisted step data from an `AssistantTurn` row. When present, the
   * component renders one block per tool call: a registered TalentUI's
   * `renderResult` if the matching outcome exists, else `renderPending`
   * if this step is part of the active run, else nothing.
   */
  step?: AgentStep;
  /**
   * True if this step belongs to the active run. Computed once at the
   * ChatView level (single source of truth) — see Active-vs-persisted
   * predicate in the story.
   */
  isActiveRun?: boolean;
  /**
   * Active-run pending talent names. Populated by the reducer from
   * parsed tool_calls. When the active step has no `toolCalls` yet but
   * the runner has flagged talents as pending (early streaming), this
   * is what drives the per-talent skeleton.
   */
  pendingTalentNames?: string[];
  /**
   * True if the active run is currently in `generating_tool_call`
   * status. Used as a final fallback for the generic "preparing tool"
   * copy when neither outcomes nor pendingTalentNames are populated.
   */
  isGeneratingToolCall?: boolean;
}

/**
 * Pure rendering component that delegates talent output to registered
 * TalentUI renderers via {@link talentUIRegistry}. Reads `step.toolCalls`
 * / `step.toolOutcomes` for persisted (and in-flight) steps and falls
 * back to active-run hints (`pendingTalentNames`, `isGeneratingToolCall`)
 * when the step itself doesn't carry tool data yet.
 *
 * The legacy metadata-bag readers (metadata.talentCalls, talentResults,
 * pendingTalentNames) are intentionally absent — PR-705 never shipped
 * so no production user data carries those fields.
 */
export const TalentSurface: React.FC<TalentSurfaceProps> = ({
  step,
  isActiveRun = false,
  pendingTalentNames,
  isGeneratingToolCall = false,
}) => {
  const l10n = useContext(L10nContext);

  // Result phase: iterate the step's tool calls.
  if (step?.toolCalls && step.toolCalls.length > 0) {
    const outcomes = step.toolOutcomes ?? [];
    const rendered: React.ReactNode[] = [];

    for (const tc of step.toolCalls) {
      const name = tc.function?.name ?? '';
      const ui = talentUIRegistry.get(name);
      if (!ui) {
        continue;
      }

      const outcome = outcomes.find(o => o.callId === tc.id);
      if (outcome && ui.renderResult) {
        const node = ui.renderResult(outcome.result);
        if (node != null) {
          rendered.push(<React.Fragment key={tc.id}>{node}</React.Fragment>);
          continue;
        }
      }

      // Per-talent pending: only when this step is on the active run
      // (we don't replay pending UI for persisted steps that lacked
      // an outcome — that's an error case and is already represented
      // by the assistant's natural-language follow-up).
      if (isActiveRun && ui.renderPending) {
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

  // Pending phase: only meaningful for the active run; persisted steps
  // with no toolCalls have no talent UI to show.
  if (!isActiveRun) {
    return null;
  }

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

  // Generic fallback: only when actively generating a tool call.
  if (isGeneratingToolCall) {
    return (
      <View testID="talent-call-pending" style={styles.pendingContainer}>
        <Text style={styles.pendingText}>
          {l10n.chat.generatingPreviewPending}
        </Text>
      </View>
    );
  }

  return null;
};
