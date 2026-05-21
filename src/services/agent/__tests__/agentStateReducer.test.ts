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

  it('#6 step_started with isFollowUp=true → prefill (covers follow-up dead zone)', () => {
    const next = agentStateReducer(
      {...initialAgentUiState, status: 'executing_tool'},
      {type: 'step_started', turn: 1, isFollowUp: true},
    );
    expect(next.status).toBe('prefill');
    expect(next.pendingTalentNames).toEqual([]);
  });

  it('#6c follow-up: first content/reasoning token after prefill → streaming_text', () => {
    const afterStepStarted = agentStateReducer(
      {...initialAgentUiState, status: 'executing_tool'},
      {type: 'step_started', turn: 1, isFollowUp: true},
    );
    expect(afterStepStarted.status).toBe('prefill');
    const afterToken = agentStateReducer(afterStepStarted, {
      type: 'token',
      delta: {content: 'hello'},
    });
    expect(afterToken.status).toBe('streaming_text');
  });

  it('#6d follow-up: empty content token in prefill preserves prefill (no premature flip)', () => {
    const prefillState: AgentUiState = {
      status: 'prefill',
      pendingTalentNames: [],
      hitMaxTurns: false,
    };
    const next = agentStateReducer(prefillState, {
      type: 'token',
      delta: {content: ''},
    });
    expect(next.status).toBe('prefill');
  });

  it('#6b step_started with isFollowUp=false → prefill (initial step also waits for first token)', () => {
    // Both initial and follow-up step_started events keep status at
    // `prefill`. The transition to `streaming_text` happens on the
    // first content/reasoning token via `case 'token'`. This is what
    // makes the PendingIndicator visible during the gap between
    // run_started and the first token (especially for slow first-token
    // models or cold context).
    const next = agentStateReducer(
      {...initialAgentUiState, status: 'prefill'},
      {type: 'step_started', turn: 0, isFollowUp: false},
    );
    expect(next.status).toBe('prefill');
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

  it('subsequent tool-call tokens during the same phase return the same state reference', () => {
    // Reference equality is load-bearing for streaming perf: the chat
    // hook's call-site guard (`if (next !== uiState)`) relies on this
    // to suppress per-token MobX writes during long tool-call
    // generations (e.g. render_html building a complex page).
    const first = agentStateReducer(initialAgentUiState, {
      type: 'token',
      delta: {
        toolCalls: [
          {id: 'c0', function: {name: 'render_html', arguments: '{'}},
        ],
      },
    });
    expect(first.status).toBe('generating_tool_call');
    expect(first.pendingTalentNames).toEqual(['render_html']);
    // Now feed many subsequent tool-call tokens. The reducer must
    // return the same `first` reference each time — not a structurally
    // equal new object.
    let state = first;
    for (let i = 0; i < 10; i++) {
      const next = agentStateReducer(state, {
        type: 'token',
        delta: {
          toolCalls: [
            {id: 'c0', function: {name: '', arguments: 'x'.repeat(i)}},
          ],
        },
      });
      expect(next).toBe(state);
      state = next;
    }
  });

  it('pendingTalentNames stay stable when later deltas drop the function name', () => {
    // llama.rn sometimes emits the function name only on the first
    // tool-call delta and leaves it empty on subsequent ones — the
    // reducer must carry the original names through so the indicator
    // label doesn't flicker.
    const after1 = agentStateReducer(initialAgentUiState, {
      type: 'token',
      delta: {
        toolCalls: [
          {id: 'c0', function: {name: 'render_html', arguments: '{'}},
        ],
      },
    });
    expect(after1.pendingTalentNames).toEqual(['render_html']);
    const after2 = agentStateReducer(after1, {
      type: 'token',
      delta: {
        toolCalls: [{id: 'c0', function: {name: '', arguments: '{"html":"'}}],
      },
    });
    expect(after2.pendingTalentNames).toEqual(['render_html']);
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
    // Phase walk:
    //   run_started        → prefill
    //   step_started(0)    → prefill (initial dead zone covered)
    //   token(content)     → streaming_text (first content token flips)
    //   token(toolCalls)   → generating_tool_call
    //   tool_call_started  → executing_tool
    //   tool_call_finished → executing_tool
    //   step_finished      → executing_tool (no-op)
    //   step_started(F=t)  → prefill (follow-up dead zone covered)
    //   token(content)     → streaming_text (first follow-up token)
    //   step_finished      → streaming_text (no-op)
    //   run_finished       → done
    expect(statuses).toEqual([
      'prefill',
      'prefill',
      'streaming_text',
      'generating_tool_call',
      'executing_tool',
      'executing_tool',
      'executing_tool',
      'prefill',
      'streaming_text',
      'streaming_text',
      'done',
    ]);
  });

  // ---------- PendingIndicator no-flicker invariant.
  //   The active-set predicate (`isPending`) at ChatView is:
  //   status ∈ { prefill, generating_tool_call, executing_tool }
  //   It must stay stable through a fast streaming sequence — once
  //   status flips to `streaming_text`, no token event flips it back.
  //   Otherwise the indicator would visibly flicker on/off between
  //   tokens. ----------

  describe('PendingIndicator no-flicker invariant', () => {
    const isPending = (s: AgentUiState) =>
      s.status === 'prefill' ||
      s.status === 'generating_tool_call' ||
      s.status === 'executing_tool';

    it('rapid token sequence (50 short content deltas) keeps isPending=false throughout streaming', () => {
      // Walk through prefill → streaming_text → … 50 short token
      // deltas representing fast character-by-character streaming.
      // Once we leave prefill on the first content token, isPending
      // must stay false until the run finishes.
      let s = initialAgentUiState;
      s = agentStateReducer(s, {type: 'run_started', messageId: 'm1'});
      s = agentStateReducer(s, {
        type: 'step_started',
        turn: 0,
        isFollowUp: false,
      });
      // First content token → flip prefill → streaming_text.
      s = agentStateReducer(s, {type: 'token', delta: {content: 'H'}});
      expect(s.status).toBe('streaming_text');
      expect(isPending(s)).toBe(false);

      const transitions: boolean[] = [];
      // Simulate a fast burst of 50 token events. Each token only
      // carries a single character (worst-case fragmentation).
      for (let i = 0; i < 50; i++) {
        s = agentStateReducer(s, {
          type: 'token',
          delta: {content: String.fromCharCode(33 + (i % 90))},
        });
        transitions.push(isPending(s));
      }
      // No flicker: every frame is non-pending.
      expect(transitions.every(p => p === false)).toBe(true);
      // Sanity — status never left streaming_text.
      expect(s.status).toBe('streaming_text');
    });

    it('mixed reasoningContent + content tokens never flip isPending back to true mid-stream', () => {
      // Some models interleave reasoning and content tokens. Both
      // are "visible deltas" per the reducer; neither should flip
      // status back to prefill once we've started streaming.
      let s = initialAgentUiState;
      s = agentStateReducer(s, {type: 'run_started', messageId: 'm1'});
      s = agentStateReducer(s, {
        type: 'step_started',
        turn: 0,
        isFollowUp: false,
      });
      // First reasoning token still flips prefill → streaming_text
      // (the predicate `hasVisibleDelta` includes reasoningContent).
      s = agentStateReducer(s, {
        type: 'token',
        delta: {reasoningContent: 'Let me think…'},
      });
      expect(s.status).toBe('streaming_text');

      const events: AgentEvent[] = [
        {type: 'token', delta: {reasoningContent: ' more'}},
        {type: 'token', delta: {content: 'Hello'}},
        {type: 'token', delta: {content: ', '}},
        {type: 'token', delta: {reasoningContent: ' actually'}},
        {type: 'token', delta: {content: 'world'}},
      ];
      const transitions: string[] = [];
      for (const e of events) {
        s = agentStateReducer(s, e);
        transitions.push(s.status);
      }
      // Every transition stays in streaming_text; predicate stays
      // false throughout.
      expect(transitions.every(t => t === 'streaming_text')).toBe(true);
    });

    it('empty / whitespace-only token deltas do NOT toggle the predicate (idempotent on no-visible-delta)', () => {
      // The reducer's `hasVisibleDelta` check requires content or
      // reasoningContent length > 0. Empty deltas (e.g. partial
      // chunks the engine emits between visible tokens) must be
      // no-ops. If they leaked through and reset status, the
      // indicator would briefly reappear between tokens — flicker.
      let s = initialAgentUiState;
      s = agentStateReducer(s, {type: 'run_started', messageId: 'm1'});
      s = agentStateReducer(s, {
        type: 'step_started',
        turn: 0,
        isFollowUp: false,
      });
      s = agentStateReducer(s, {type: 'token', delta: {content: 'hello'}});
      expect(s.status).toBe('streaming_text');

      // A no-op token (empty delta) must not change status.
      const before = s;
      const after = agentStateReducer(s, {
        type: 'token',
        delta: {content: ''},
      });
      expect(after).toEqual(before);
      expect(isPending(after)).toBe(false);
    });
  });
});
