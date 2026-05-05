import {agentStateReducer} from '../agentStateReducer';
import {initialAgentUiState} from '../AgentRunner.types';
import type {AgentEvent, AgentUiState} from '../AgentRunner.types';

const noopRunResult = {
  steps: [],
  hitMaxTurns: false,
  finalResult: {text: '', content: ''} as any,
};

describe('agentStateReducer', () => {
  // ---------- Story Test Requirements (Reducer) #1–#7 ----------

  it('#1 run_started → status prefill', () => {
    const next = agentStateReducer(initialAgentUiState, {
      type: 'run_started',
      messageId: 'm1',
    });
    expect(next).toEqual<AgentUiState>({
      status: 'prefill',
      pendingTalentNames: [],
      hitMaxTurns: false,
    });
  });

  it('#2 marker_seen → generating_tool_call', () => {
    const after = agentStateReducer(
      {...initialAgentUiState, status: 'streaming_text'},
      {type: 'marker_seen', marker: '<|tool_call|>'},
    );
    expect(after.status).toBe('generating_tool_call');
  });

  it('#3 token with content while generating_tool_call → does NOT clear pendingTalentNames (regression guard)', () => {
    const initial: AgentUiState = {
      status: 'generating_tool_call',
      pendingTalentNames: ['calculate'],
      hitMaxTurns: false,
    };
    const event: AgentEvent = {
      type: 'token',
      delta: {content: 'thinking out loud…'},
    };
    const next = agentStateReducer(initial, event);
    expect(next.status).toBe('generating_tool_call');
    expect(next.pendingTalentNames).toEqual(['calculate']);
  });

  it('#4 token with toolCalls → generating_tool_call, populates pendingTalentNames', () => {
    const next = agentStateReducer(
      {...initialAgentUiState, status: 'streaming_text'},
      {
        type: 'token',
        delta: {
          toolCalls: [
            {id: 'c0', function: {name: 'calculate', arguments: '{}'}},
            {id: 'c1', function: {name: 'datetime', arguments: '{}'}},
          ],
        },
      },
    );
    expect(next.status).toBe('generating_tool_call');
    expect(next.pendingTalentNames).toEqual(['calculate', 'datetime']);
  });

  it('#5 tool_call_started → executing_tool', () => {
    const next = agentStateReducer(
      {
        status: 'generating_tool_call',
        pendingTalentNames: ['calculate'],
        hitMaxTurns: false,
      },
      {
        type: 'tool_call_started',
        call: {id: 'c0', function: {name: 'calculate', arguments: '{}'}},
      },
    );
    expect(next.status).toBe('executing_tool');
    // pendingTalentNames clears once execution starts
    expect(next.pendingTalentNames).toEqual([]);
  });

  it('#6 step_started with isFollowUp=true → streaming_text (D5: streaming_followup collapsed)', () => {
    const next = agentStateReducer(
      {...initialAgentUiState, status: 'executing_tool'},
      {type: 'step_started', turn: 1, isFollowUp: true},
    );
    expect(next.status).toBe('streaming_text');
    expect(next.pendingTalentNames).toEqual([]);
  });

  it('#6b step_started with isFollowUp=false → streaming_text', () => {
    const next = agentStateReducer(
      {...initialAgentUiState, status: 'prefill'},
      {type: 'step_started', turn: 0, isFollowUp: false},
    );
    expect(next.status).toBe('streaming_text');
  });

  it('#7 run_finished hitMaxTurns=true → done, hitMaxTurns=true', () => {
    const next = agentStateReducer(
      {...initialAgentUiState, status: 'streaming_text'},
      {
        type: 'run_finished',
        result: {...noopRunResult, hitMaxTurns: true},
      },
    );
    expect(next.status).toBe('done');
    expect(next.hitMaxTurns).toBe(true);
  });

  // ---------- Coverage of remaining branches ----------

  it('run_finished hitMaxTurns=false → done, hitMaxTurns=false', () => {
    const next = agentStateReducer(
      {...initialAgentUiState, status: 'streaming_text'},
      {
        type: 'run_finished',
        result: {...noopRunResult, hitMaxTurns: false},
      },
    );
    expect(next.status).toBe('done');
    expect(next.hitMaxTurns).toBe(false);
  });

  it('run_failed mid-run → status failed, pendingTalentNames cleared, status preserved across rest of state', () => {
    const before: AgentUiState = {
      status: 'executing_tool',
      pendingTalentNames: ['calculate'],
      hitMaxTurns: false,
    };
    const next = agentStateReducer(before, {
      type: 'run_failed',
      error: new Error('engine boom'),
    });
    expect(next.status).toBe('failed');
    expect(next.pendingTalentNames).toEqual([]);
    expect(next.hitMaxTurns).toBe(false);
  });

  it('token with empty content/reasoning preserves state (idempotent on plain delta)', () => {
    const before: AgentUiState = {
      status: 'streaming_text',
      pendingTalentNames: [],
      hitMaxTurns: false,
    };
    const next = agentStateReducer(before, {
      type: 'token',
      delta: {content: ''},
    });
    expect(next).toEqual(before);
  });

  it('token with reasoningContent only preserves status', () => {
    const before: AgentUiState = {
      status: 'streaming_text',
      pendingTalentNames: [],
      hitMaxTurns: false,
    };
    const next = agentStateReducer(before, {
      type: 'token',
      delta: {reasoningContent: 'thinking…'},
    });
    expect(next.status).toBe('streaming_text');
  });

  it('tool_call_finished is a no-op on UI state', () => {
    const before: AgentUiState = {
      status: 'executing_tool',
      pendingTalentNames: [],
      hitMaxTurns: false,
    };
    const next = agentStateReducer(before, {
      type: 'tool_call_finished',
      outcome: {
        callId: 'c0',
        toolName: 'calculate',
        result: {type: 'text', summary: '42'},
        responseContent: '42',
      },
    });
    expect(next).toEqual(before);
  });

  it('step_finished is a no-op on UI state', () => {
    const before: AgentUiState = {
      status: 'streaming_text',
      pendingTalentNames: [],
      hitMaxTurns: false,
    };
    const next = agentStateReducer(before, {type: 'step_finished', turn: 0});
    expect(next).toEqual(before);
  });

  it('toolCalls without function names are filtered out of pendingTalentNames', () => {
    const next = agentStateReducer(initialAgentUiState, {
      type: 'token',
      delta: {
        toolCalls: [
          // missing function name — defensively filtered
          {id: 'x', function: {name: '', arguments: '{}'}},
          {id: 'y', function: {name: 'calculate', arguments: '{}'}},
        ],
      },
    });
    expect(next.status).toBe('generating_tool_call');
    expect(next.pendingTalentNames).toEqual(['calculate']);
  });

  it('idempotent: feeding the same event twice yields the same output', () => {
    const event: AgentEvent = {type: 'run_started', messageId: 'm-id'};
    const once = agentStateReducer(initialAgentUiState, event);
    const twice = agentStateReducer(once, event);
    expect(twice).toEqual(once);
  });

  it('scripted sequence: tool-using turn produces the expected status timeline', () => {
    const sequence: AgentEvent[] = [
      {type: 'run_started', messageId: 'msg'},
      {type: 'step_started', turn: 0, isFollowUp: false},
      {type: 'token', delta: {content: 'Let me calculate that…'}},
      {
        type: 'token',
        delta: {
          toolCalls: [
            {id: 'c0', function: {name: 'calculate', arguments: '{}'}},
          ],
        },
      },
      {
        type: 'tool_call_started',
        call: {id: 'c0', function: {name: 'calculate', arguments: '{}'}},
      },
      {
        type: 'tool_call_finished',
        outcome: {
          callId: 'c0',
          toolName: 'calculate',
          result: {type: 'text', summary: '42'},
          responseContent: '42',
        },
      },
      {type: 'step_finished', turn: 0},
      {type: 'step_started', turn: 1, isFollowUp: true},
      {type: 'token', delta: {content: 'The answer is 42'}},
      {type: 'step_finished', turn: 1},
      {type: 'run_finished', result: {...noopRunResult}},
    ];

    const states: AgentUiState[] = [];
    let s = initialAgentUiState;
    for (const e of sequence) {
      s = agentStateReducer(s, e);
      states.push({...s});
    }
    const statuses = states.map(x => x.status);
    expect(statuses).toEqual([
      'prefill',
      'streaming_text',
      'streaming_text',
      'generating_tool_call',
      'executing_tool',
      'executing_tool',
      'executing_tool',
      'streaming_text',
      'streaming_text',
      'streaming_text',
      'done',
    ]);
  });
});
