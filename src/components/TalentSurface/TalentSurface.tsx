import React from 'react';

import {talentUIRegistry} from '../../services/talents/TalentUIRegistry';
import {AgentStep} from '../../utils/types';

import {ToolErrorBlock} from '../ToolErrorBlock';
import {ToolMetricsFooter} from '../ToolMetricsFooter';
import {ToolUsedChip} from '../ToolUsedChip';

interface TalentSurfaceProps {
  /**
   * Persisted step data. The component iterates `step.toolCalls` in
   * array order and dispatches each to one of four cases:
   *
   *   1. <ToolErrorBlock />  — outcome.result.type === 'error'
   *   2. talent UI           — outcome exists, non-error, and the
   *                            TalentUIRegistry has a renderResult
   *                            for the call's name
   *   3. <ToolUsedChip />    — outcome exists, non-error, no
   *                            registered TalentUI
   *   4. (none)              — outcome not yet landed; the
   *                            ChatView-owned PendingIndicator covers
   *                            feedback during the in-flight window
   *
   * `outcome.callId === call.id` holds by construction: the runner
   * attaches the same normalized id to both `step_finished` (consumed
   * by `appendToolCall`) and `tool_call_finished` (consumed by
   * `appendToolOutcome`).
   */
  step?: AgentStep;
}

export const TalentSurface: React.FC<TalentSurfaceProps> = ({step}) => {
  const calls = step?.toolCalls;
  if (!calls || calls.length === 0) {
    return null;
  }

  const outcomes = step?.toolOutcomes ?? [];
  const rendered: React.ReactNode[] = [];

  for (const call of calls) {
    const name = call.function?.name ?? '';
    const outcome = outcomes.find(o => o.callId === call.id);

    // 4. No outcome yet — pending indicator (ChatView) handles UX.
    if (!outcome) {
      continue;
    }

    // 1. Error outcome — subtle inline error block.
    if (outcome.result.type === 'error') {
      rendered.push(
        <React.Fragment key={call.id}>
          <ToolErrorBlock
            toolName={name}
            errorMessage={outcome.result.errorMessage}
          />
        </React.Fragment>,
      );
      continue;
    }

    // 2. Registered talent UI for this tool name — render its result.
    //    The metrics footer (post-hoc tokens + duration) renders as a
    //    sibling beneath the result so each TalentUI can stay focused
    //    on its visual envelope; the footer is identical across all
    //    talents (visual family with AssistantTurnFooter).
    const ui = talentUIRegistry.get(name);
    if (ui?.renderResult) {
      const node = ui.renderResult(outcome.result);
      if (node != null) {
        rendered.push(
          <React.Fragment key={call.id}>
            {node}
            {call.metrics && <ToolMetricsFooter metrics={call.metrics} />}
          </React.Fragment>,
        );
        continue;
      }
    }

    // 3. No registered UI (or renderResult returned null) — subtle
    //    "used X" chip so the user still sees the tool was invoked.
    //    The chip carries metrics inline (same line) when present.
    rendered.push(
      <React.Fragment key={call.id}>
        <ToolUsedChip toolName={name} metrics={call.metrics} />
      </React.Fragment>,
    );
  }

  if (rendered.length === 0) {
    return null;
  }
  return <>{rendered}</>;
};
