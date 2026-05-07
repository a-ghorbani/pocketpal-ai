import {runAgent} from '../AgentRunner';
import type {AgentEvent} from '../AgentRunner.types';
import type {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
  CompletionStreamData,
} from '../../../utils/completionTypes';
import type {TalentEngine, TalentResult} from '../../talents/types';

/**
 * Helper: build a CompletionEngine whose `completion()` invokes the
 * callback with each scripted token, then resolves with the supplied
 * `result`. Mirrors how llama.rn streams real tokens via JS callbacks.
 */
function makeScriptedEngine(opts: {
  scripts: Array<{
    tokens: CompletionStreamData[];
    result: CompletionResult;
  }>;
}): CompletionEngine {
  let turnIndex = 0;
  return {
    completion: jest.fn(
      async (
        _params: ApiCompletionParams,
        cb?: (d: CompletionStreamData) => void,
      ): Promise<CompletionResult> => {
        const turn = opts.scripts[turnIndex] ?? {
          tokens: [],
          result: {text: '', content: ''} as CompletionResult,
        };
        turnIndex += 1;
        if (cb) {
          for (const t of turn.tokens) {
            cb(t);
          }
        }
        return turn.result;
      },
    ),
    stopCompletion: jest.fn(async () => {}),
  };
}

function makeTalent(
  name: string,
  impl: (args: Record<string, any>) => Promise<TalentResult> | TalentResult,
): TalentEngine {
  return {
    name,
    execute: async args => Promise.resolve(impl(args)),
    toToolDefinition: () => ({
      type: 'function',
      function: {name, description: name, parameters: {}},
    }),
  };
}

const baseParams: ApiCompletionParams = {messages: []} as any;

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of iter) {
    out.push(e);
  }
  return out;
}

describe('runAgent', () => {
  // ---------- Story Test Requirements (AgentRunner) #1–#18 ----------

  it('#1 single turn, no tools → run_started, step_started, token*, step_finished, run_finished', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [{content: 'hi'}, {content: ' there'}],
          result: {text: 'hi there', content: 'hi there'},
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: [],
        talentLookup: () => undefined,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const types = events.map(e => e.type);
    expect(types).toEqual([
      'run_started',
      'step_started',
      'token',
      'token',
      'step_finished',
      'run_finished',
    ]);
    const finished = events[events.length - 1] as Extract<
      AgentEvent,
      {type: 'run_finished'}
    >;
    expect(finished.result.hitMaxTurns).toBe(false);
  });

  it('#2 one tool call → loops once, two step_started events', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [{content: 'Let me calculate'}],
          result: {
            text: 'Let me calculate',
            content: 'Let me calculate',
            tool_calls: [
              {
                id: 'call-0',
                type: 'function',
                function: {name: 'calculate', arguments: '{"expr":"2+2"}'},
              },
            ],
          },
        },
        {
          tokens: [{content: 'The answer is 4'}],
          result: {text: 'The answer is 4', content: 'The answer is 4'},
        },
      ],
    });
    const calculate = makeTalent('calculate', () => ({
      type: 'text',
      summary: '4',
    }));

    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['calculate'],
        talentLookup: name => (name === 'calculate' ? calculate : undefined),
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const stepStarts = events.filter(e => e.type === 'step_started');
    expect(stepStarts).toHaveLength(2);
    expect((stepStarts[0] as any).isFollowUp).toBe(false);
    expect((stepStarts[1] as any).isFollowUp).toBe(true);
    const finished = events.filter(e => e.type === 'tool_call_finished');
    expect(finished).toHaveLength(1);
    expect((finished[0] as any).outcome.responseContent).toBe('4');
  });

  it('#3 tool call but second turn yields no further tool_calls → run finishes after follow-up', async () => {
    // Note: the runner does not consult `requiresModelResponse`; it always
    // performs a follow-up turn after tool calls and only exits the loop
    // when the next turn yields no tool_calls. Story Test #3 in the
    // current runner shape is therefore identical to #2 from a control
    // flow perspective. This test asserts the early termination path.
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'render_html', arguments: '{}'},
              },
            ],
          },
        },
        {
          tokens: [],
          result: {text: 'all done', content: 'all done'},
        },
      ],
    });
    const renderHtml = makeTalent('render_html', () => ({
      type: 'html',
      html: '<p>hi</p>',
      summary: 'rendered',
    }));
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['render_html'],
        talentLookup: () => renderHtml,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const finished = events[events.length - 1];
    expect(finished.type).toBe('run_finished');
    expect(
      events.find(
        e =>
          e.type === 'tool_call_finished' &&
          e.outcome.toolName === 'render_html',
      ),
    ).toBeTruthy();
  });

  it('#4 chained tool calls → multi-turn loop', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'datetime', arguments: '{}'},
              },
            ],
          },
        },
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: {name: 'calculate', arguments: '{"expr":"1+1"}'},
              },
            ],
          },
        },
        {
          tokens: [{content: 'final'}],
          result: {text: 'final', content: 'final'},
        },
      ],
    });
    const datetime = makeTalent('datetime', () => ({
      type: 'text',
      summary: 'now',
    }));
    const calculate = makeTalent('calculate', () => ({
      type: 'text',
      summary: '2',
    }));

    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['datetime', 'calculate'],
        talentLookup: name =>
          name === 'datetime'
            ? datetime
            : name === 'calculate'
              ? calculate
              : undefined,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    expect(events.filter(e => e.type === 'step_started')).toHaveLength(3);
    expect(events.filter(e => e.type === 'tool_call_finished')).toHaveLength(2);
    expect(events[events.length - 1].type).toBe('run_finished');
  });

  it('#5 maxTurns hit → run_finished with hitMaxTurns=true (NOT run_failed)', async () => {
    // Engine always asks for more tools — never produces a final answer.
    const engine: CompletionEngine = {
      completion: jest.fn(async (_p, cb) => {
        cb?.({});
        return {
          text: '',
          content: '',
          tool_calls: [
            {
              id: `c-${Math.random()}`,
              type: 'function',
              function: {name: 'datetime', arguments: '{}'},
            },
          ],
        } as CompletionResult;
      }),
      stopCompletion: jest.fn(async () => {}),
    };
    const datetime = makeTalent('datetime', () => ({
      type: 'text',
      summary: 'now',
    }));
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['datetime'],
        talentLookup: () => datetime,
        messageId: 'msg',
        triggerMarkers: [],
        maxTurns: 3,
      }),
    );
    const finished = events.find(e => e.type === 'run_finished') as
      | Extract<AgentEvent, {type: 'run_finished'}>
      | undefined;
    expect(finished).toBeDefined();
    expect(finished!.result.hitMaxTurns).toBe(true);
    expect(events.find(e => e.type === 'run_failed')).toBeUndefined();
  });

  it('#6 malformed JSON args → tool_call_finished with error outcome', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'calculate', arguments: '{not json'},
              },
            ],
          },
        },
        {
          tokens: [{content: 'sorry'}],
          result: {text: 'sorry', content: 'sorry'},
        },
      ],
    });
    const calculate = makeTalent('calculate', () => ({
      type: 'text',
      summary: 'ignored',
    }));
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['calculate'],
        talentLookup: () => calculate,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const tcf = events.find(e => e.type === 'tool_call_finished') as Extract<
      AgentEvent,
      {type: 'tool_call_finished'}
    >;
    expect(tcf).toBeDefined();
    expect(tcf.outcome.result.type).toBe('error');
    expect(tcf.outcome.responseContent).toMatch(/invalid JSON/);
  });

  it('#7 unknown talent (not in registry) → outcome.result.type === error', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'mystery', arguments: '{}'},
              },
            ],
          },
        },
        {
          tokens: [],
          result: {text: 'ok', content: 'ok'},
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        // Talent IS in allowedTalentNames but NOT in the registry.
        allowedTalentNames: ['mystery'],
        talentLookup: () => undefined,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const tcf = events.find(e => e.type === 'tool_call_finished') as Extract<
      AgentEvent,
      {type: 'tool_call_finished'}
    >;
    expect(tcf.outcome.result.type).toBe('error');
    expect(tcf.outcome.responseContent).toMatch(/not available/);
  });

  it('#8 talent not in allowedTalentNames → outcome rejected', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'evil', arguments: '{}'},
              },
            ],
          },
        },
        {
          tokens: [],
          result: {text: 'ok', content: 'ok'},
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        // Empty allow-list — model invented a tool the Pal does not advertise.
        allowedTalentNames: [],
        talentLookup: () =>
          makeTalent('evil', () => ({type: 'text', summary: 'pwn'})),
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const tcf = events.find(e => e.type === 'tool_call_finished') as Extract<
      AgentEvent,
      {type: 'tool_call_finished'}
    >;
    expect(tcf.outcome.result.type).toBe('error');
    expect(tcf.outcome.responseContent).toMatch(/not enabled/);
  });

  it('#9 talent execute() throws → outcome.result.type === error', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'broken', arguments: '{}'},
              },
            ],
          },
        },
        {
          tokens: [],
          result: {text: 'ok', content: 'ok'},
        },
      ],
    });
    const broken: TalentEngine = {
      name: 'broken',
      execute: async () => {
        throw new Error('kaboom');
      },
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'broken', description: '', parameters: {}},
      }),
    };
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['broken'],
        talentLookup: () => broken,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const tcf = events.find(e => e.type === 'tool_call_finished') as Extract<
      AgentEvent,
      {type: 'tool_call_finished'}
    >;
    expect(tcf.outcome.result.type).toBe('error');
    expect(tcf.outcome.responseContent).toMatch(/kaboom/);
  });

  it('#10 signal.aborted=true between turns → run terminates without follow-up', async () => {
    const controller = new AbortController();
    const engine: CompletionEngine = {
      completion: jest.fn(async (_p, cb) => {
        cb?.({content: 'first'});
        // Abort once the first turn finishes — i.e. before the next loop iteration.
        controller.abort();
        return {
          text: 'first',
          content: 'first',
          tool_calls: [
            {
              id: 'c0',
              type: 'function',
              function: {name: 'datetime', arguments: '{}'},
            },
          ],
        } as CompletionResult;
      }),
      stopCompletion: jest.fn(async () => {}),
    };
    const datetime = makeTalent('datetime', () => ({
      type: 'text',
      summary: 'now',
    }));
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['datetime'],
        talentLookup: () => datetime,
        messageId: 'msg',
        triggerMarkers: [],
        signal: controller.signal,
      }),
    );
    const stepStarts = events.filter(e => e.type === 'step_started');
    // No follow-up step_started after the abort.
    expect(stepStarts).toHaveLength(1);
    expect(events[events.length - 1].type).toBe('run_finished');
  });

  it('#11 triggerMarkers contains marker, content matches → marker_seen fires exactly once', async () => {
    // The model streams a marker but never produces a parsed tool_call —
    // the runner must still emit marker_seen so the UI can flip its
    // status copy at marker time.
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [{content: 'preamble <tool_call> trailing'}],
          result: {
            text: 'preamble <tool_call> trailing',
            content: 'preamble <tool_call> trailing',
          },
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: [],
        talentLookup: () => undefined,
        messageId: 'msg',
        triggerMarkers: ['<tool_call>'],
      }),
    );
    const markerSeen = events.filter(e => e.type === 'marker_seen');
    expect(markerSeen).toHaveLength(1);
    expect((markerSeen[0] as any).marker).toBe('<tool_call>');
  });

  it('#19 marker straddles two stream chunks → token,token,marker_seen in order', async () => {
    // Chunk 1 ends with a partial marker prefix; chunk 2 completes it.
    // The runner must enqueue the token event for each chunk in order
    // and only emit marker_seen AFTER the second token (the one whose
    // content completed the substring).
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [{content: 'foo<tool_'}, {content: 'call>bar'}],
          result: {
            text: 'foo<tool_call>bar',
            content: 'foo<tool_call>bar',
          },
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: [],
        talentLookup: () => undefined,
        messageId: 'msg',
        triggerMarkers: ['<tool_call>'],
      }),
    );

    // Filter to only the in-step events (drop run_started/step_started/
    // step_finished/run_finished framing) so the explicit ordering
    // assertion focuses on the streaming bridge's emission sequence.
    const streamEvents = events.filter(
      e => e.type === 'token' || e.type === 'marker_seen',
    );
    expect(streamEvents).toHaveLength(3);
    expect(streamEvents[0].type).toBe('token');
    expect((streamEvents[0] as any).delta.content).toBe('foo<tool_');
    expect(streamEvents[1].type).toBe('token');
    expect((streamEvents[1] as any).delta.content).toBe('call>bar');
    expect(streamEvents[2].type).toBe('marker_seen');
    expect((streamEvents[2] as any).marker).toBe('<tool_call>');

    // Exactly one marker_seen for the whole step.
    expect(events.filter(e => e.type === 'marker_seen')).toHaveLength(1);
  });

  it('#20 triggerMarkers: [] → no marker_seen events; tool flow still correct via tool_call_started', async () => {
    // Empty triggerMarkers disables marker scanning entirely. The
    // runner must skip the scan and still emit tool_call_started/
    // tool_call_finished as normal when the engine returns parsed
    // tool_calls.
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [{content: 'preamble <tool_call> trailing'}],
          result: {
            text: 'preamble <tool_call> trailing',
            content: 'preamble <tool_call> trailing',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'calculate', arguments: '{"expr":"1+1"}'},
              },
            ],
          },
        },
        {
          tokens: [{content: 'final'}],
          result: {text: 'final', content: 'final'},
        },
      ],
    });
    const calculate = makeTalent('calculate', () => ({
      type: 'text',
      summary: '2',
    }));
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['calculate'],
        talentLookup: () => calculate,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    expect(events.filter(e => e.type === 'marker_seen')).toHaveLength(0);
    // tool_call_started fired (the UX path that drives status flip in
    // the absence of marker scanning).
    expect(events.filter(e => e.type === 'tool_call_started')).toHaveLength(1);
    expect(events.filter(e => e.type === 'tool_call_finished')).toHaveLength(1);
  });

  it('#21 multi-step run with markers in step 0 and step 1 → exactly two marker_seen, each after its step token', async () => {
    // Step 0: model emits marker, parsed tool_calls arrive →
    // tool executes, follow-up step starts.
    // Step 1: model emits marker again in the follow-up content.
    // Per-step reset semantics: each iteration declares a fresh
    // markerSeenThisStep flag, so both steps independently fire
    // marker_seen exactly once.
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [{content: 'thinking <tool_call> calling'}],
          result: {
            text: 'thinking <tool_call> calling',
            content: 'thinking <tool_call> calling',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'calculate', arguments: '{"expr":"1+1"}'},
              },
            ],
          },
        },
        {
          tokens: [{content: 'follow-up <tool_call> again'}],
          result: {
            text: 'follow-up <tool_call> again',
            content: 'follow-up <tool_call> again',
          },
        },
      ],
    });
    const calculate = makeTalent('calculate', () => ({
      type: 'text',
      summary: '2',
    }));
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['calculate'],
        talentLookup: () => calculate,
        messageId: 'msg',
        triggerMarkers: ['<tool_call>'],
      }),
    );
    const markerSeen = events.filter(e => e.type === 'marker_seen');
    expect(markerSeen).toHaveLength(2);

    // Verify each marker_seen comes AFTER a token within its own
    // step_started/step_finished window. We slice the event sequence
    // by step boundaries and check the ordering inside each.
    const stepStartedIdx = events
      .map((e, i) => ({e, i}))
      .filter(({e}) => e.type === 'step_started')
      .map(({i}) => i);
    const stepFinishedIdx = events
      .map((e, i) => ({e, i}))
      .filter(({e}) => e.type === 'step_finished')
      .map(({i}) => i);
    expect(stepStartedIdx).toHaveLength(2);
    expect(stepFinishedIdx).toHaveLength(2);

    for (let s = 0; s < 2; s += 1) {
      const slice = events.slice(stepStartedIdx[s], stepFinishedIdx[s] + 1);
      const tokens = slice.filter(e => e.type === 'token');
      const markers = slice.filter(e => e.type === 'marker_seen');
      expect(markers).toHaveLength(1);
      expect(tokens.length).toBeGreaterThanOrEqual(1);
      const tokenIdx = slice.findIndex(e => e.type === 'token');
      const markerIdx = slice.findIndex(e => e.type === 'marker_seen');
      expect(tokenIdx).toBeLessThan(markerIdx);
    }
  });

  it('#13 tool_calls with id=null → outcomes carry deterministic synthetic ids', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: null as any,
                type: 'function',
                function: {name: 'calculate', arguments: '{}'},
              },
              {
                id: '' as any,
                type: 'function',
                function: {name: 'calculate', arguments: '{}'},
              },
            ],
          },
        },
        {
          tokens: [],
          result: {text: 'ok', content: 'ok'},
        },
      ],
    });
    const calculate = makeTalent('calculate', () => ({
      type: 'text',
      summary: '0',
    }));
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['calculate'],
        talentLookup: () => calculate,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const finished = events.filter(e => e.type === 'tool_call_finished');
    expect(finished).toHaveLength(2);
    const ids = finished.map(e => (e as any).outcome.callId as string);
    expect(ids[0]).toMatch(/^call_/);
    expect(ids[1]).toMatch(/^call_/);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('#14 engine rejects → run_failed emitted, iterator ends', async () => {
    const engine: CompletionEngine = {
      completion: jest.fn(async () => {
        throw new Error('engine boom');
      }),
      stopCompletion: jest.fn(async () => {}),
    };
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: [],
        talentLookup: () => undefined,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const last = events[events.length - 1];
    expect(last.type).toBe('run_failed');
    expect((last as any).error.message).toBe('engine boom');
  });

  it('#15 module graph contains no react/mobx/mobx-react-lite/store imports', () => {
    // Walk the runner module's transitive require tree (module.children).
    // This is more precise than scanning require.cache, which is global
    // (mobx etc. may already be loaded by jest/setup.ts before this test
    // runs). We only care about what the runner ITSELF reaches.
    const runnerPath = require.resolve('../AgentRunner');
    const runnerMod: NodeModule | undefined = require.cache[runnerPath];
    if (!runnerMod) {
      // Force-load the runner if it isn't already cached.
      require('../AgentRunner');
    }
    const startMod: NodeModule = require.cache[runnerPath]!;
    expect(startMod).toBeDefined();

    const visited = new Set<string>();
    const queue: NodeModule[] = [startMod];
    while (queue.length > 0) {
      const m = queue.shift()!;
      if (visited.has(m.id)) {
        continue;
      }
      visited.add(m.id);
      for (const child of m.children) {
        queue.push(child);
      }
    }

    const forbidden = [
      /[\\/]node_modules[\\/]react[\\/]/,
      /[\\/]node_modules[\\/]mobx[\\/]/,
      /[\\/]node_modules[\\/]mobx-react-lite[\\/]/,
      /[\\/]node_modules[\\/]react-native[\\/]/,
      /[\\/]src[\\/]store[\\/]/,
      // The runner must NOT import the trigger-marker cache module —
      // it consumes `triggerMarkers` only as a `string[]` value
      // injected through `AgentRunOptions`. Locks the architectural
      // invariant in CI rather than relying on a one-time grep.
      /[\\/]services[\\/]agent[\\/]triggerMarkers/,
    ];
    const reachable = Array.from(visited);
    for (const re of forbidden) {
      const hit = reachable.find(p => re.test(p));
      expect(hit).toBeUndefined();
    }
  });

  it('#16 stop mid-tool: signal.aborted during executeOne() → in-flight outcome appended, then run_finished', async () => {
    const controller = new AbortController();
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'slow', arguments: '{}'},
              },
            ],
          },
        },
        // No second turn expected — abort fires at the boundary after tool execution.
      ],
    });
    const slow: TalentEngine = {
      name: 'slow',
      // The talent's execute() runs to completion; abort fires DURING it,
      // but the runner does not cancel synchronous-ish talents — the
      // outcome is still appended.
      execute: async () => {
        controller.abort();
        return {type: 'text', summary: 'late'};
      },
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'slow', description: '', parameters: {}},
      }),
    };
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['slow'],
        talentLookup: () => slow,
        messageId: 'msg',
        triggerMarkers: [],
        signal: controller.signal,
      }),
    );
    const tcf = events.find(e => e.type === 'tool_call_finished');
    expect(tcf).toBeDefined();
    expect((tcf as any).outcome.responseContent).toBe('late');
    expect(events[events.length - 1].type).toBe('run_finished');
    // No second step_started (abort caught at the turn boundary).
    expect(events.filter(e => e.type === 'step_started')).toHaveLength(1);
  });

  it('#17 backpressure: many tokens emitted before consumer pulls → all events delivered in order', async () => {
    const tokens: CompletionStreamData[] = [];
    for (let i = 0; i < 100; i += 1) {
      tokens.push({content: String(i)});
    }
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens,
          result: {text: '', content: ''} as CompletionResult,
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: [],
        talentLookup: () => undefined,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const tokenEvents = events.filter(e => e.type === 'token');
    expect(tokenEvents).toHaveLength(100);
    const seq = tokenEvents.map(e => (e as any).delta.content);
    for (let i = 0; i < 100; i += 1) {
      expect(seq[i]).toBe(String(i));
    }
  });

  it('#18 backpressure: consumer slower than producer → no event drop, no deadlock', async () => {
    const N = 50;
    const tokens: CompletionStreamData[] = Array.from({length: N}, (_, i) => ({
      content: `t${i}`,
    }));
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens,
          result: {text: '', content: ''} as CompletionResult,
        },
      ],
    });
    const out: AgentEvent[] = [];
    for await (const e of runAgent({
      engine,
      initialParams: baseParams,
      allowedTalentNames: [],
      talentLookup: () => undefined,
      messageId: 'msg',
      triggerMarkers: [],
    })) {
      out.push(e);
      // Slow the consumer — let other microtasks run between pulls.
      await new Promise(r => setTimeout(r, 0));
    }
    const tokenEvents = out.filter(e => e.type === 'token');
    expect(tokenEvents).toHaveLength(N);
    for (let i = 0; i < N; i += 1) {
      expect((tokenEvents[i] as any).delta.content).toBe(`t${i}`);
    }
    expect(out[out.length - 1].type).toBe('run_finished');
  });

  // ---------- Additional coverage ----------

  it('reasoning_content per token is forwarded as TokenDelta.reasoningContent', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [{reasoning_content: 'thinking…'}, {content: 'final'}],
          result: {
            text: 'final',
            content: 'final',
            reasoning_content: 'thinking…',
          },
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: [],
        talentLookup: () => undefined,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const tokens = events.filter(e => e.type === 'token');
    expect((tokens[0] as any).delta.reasoningContent).toBe('thinking…');
    expect((tokens[1] as any).delta.content).toBe('final');
  });

  it('tool_call_started fires before tool_call_finished for each call', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'calculate', arguments: '{}'},
              },
              {
                id: 'c1',
                type: 'function',
                function: {name: 'calculate', arguments: '{}'},
              },
            ],
          },
        },
        {
          tokens: [],
          result: {text: 'done', content: 'done'},
        },
      ],
    });
    const calculate = makeTalent('calculate', () => ({
      type: 'text',
      summary: '0',
    }));
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['calculate'],
        talentLookup: () => calculate,
        messageId: 'msg',
        triggerMarkers: [],
      }),
    );
    const startedIdx = events
      .map((e, i) => ({e, i}))
      .filter(({e}) => e.type === 'tool_call_started')
      .map(({i}) => i);
    const finishedIdx = events
      .map((e, i) => ({e, i}))
      .filter(({e}) => e.type === 'tool_call_finished')
      .map(({i}) => i);
    expect(startedIdx).toHaveLength(2);
    expect(finishedIdx).toHaveLength(2);
    expect(startedIdx[0]).toBeLessThan(finishedIdx[0]);
    expect(startedIdx[1]).toBeLessThan(finishedIdx[1]);
  });

  // ---------- Tool-call-progress signal source ----------
  //
  // PendingIndicator surfaces a live char/line count during
  // `generating_tool_call`, sourced from
  // `delta.toolCalls[0].function.arguments`. That only works if the
  // engine emits incremental tool_calls deltas mid-stream. This test
  // proves OUR pipeline works in that case — if the indicator stays
  // empty on device, the problem is upstream (the engine isn't
  // streaming tool_calls; on-device verification via the
  // [pending-debug] logs).
  it('progressive tool_calls deltas reach the iterator with growing args', async () => {
    const stages = [
      '{"html":"<!doc',
      '{"html":"<!doctype html>\\n<html>',
      '{"html":"<!doctype html>\\n<html>\\n<body>"',
    ];
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: stages.map(args => ({
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'render_html', arguments: args},
              },
            ],
          })),
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {
                  name: 'render_html',
                  arguments: stages[stages.length - 1],
                },
              },
            ],
          },
        },
        {
          tokens: [{content: 'done'}],
          result: {text: 'done', content: 'done'},
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['render_html'],
        talentLookup: () =>
          makeTalent('render_html', () => ({
            type: 'html',
            html: 'x',
            summary: 's',
          })),
        triggerMarkers: [],
        messageId: 'm',
      }),
    );
    // Each scripted token chunk produced a `token` event whose
    // delta.toolCalls[0].function.arguments matches the staged length.
    const tokenEvents = events.filter(
      (e): e is Extract<AgentEvent, {type: 'token'}> => e.type === 'token',
    );
    const argLens = tokenEvents
      .map(e => {
        const a = e.delta.toolCalls?.[0]?.function?.arguments;
        return typeof a === 'string' ? a.length : -1;
      })
      .filter(n => n >= 0);
    expect(argLens).toEqual(stages.map(s => s.length));
    // Strictly increasing — the count source for the indicator.
    for (let i = 1; i < argLens.length; i++) {
      expect(argLens[i]).toBeGreaterThan(argLens[i - 1]);
    }
  });

  // ---------- Per-call metrics (post-hoc tokens + duration) ----------
  //
  // The runner counts streaming `token` events that carry tool_calls
  // and tracks the wall-clock duration from the first such event to
  // step finalisation. The metrics ride on the normalized toolCalls
  // attached to `step_finished`, which the hook persists via
  // appendToolCall — so post-hoc UI (chip + preview footer) can show
  // them without any new persistence path.
  it('attaches per-call generation metrics on step_finished', async () => {
    const stages = ['{"a":', '{"a":1', '{"a":12', '{"a":123}'];
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: stages.map(args => ({
            tool_calls: [
              {
                id: 'c0',
                type: 'function' as const,
                function: {name: 'calculate', arguments: args},
              },
            ],
          })),
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {
                  name: 'calculate',
                  arguments: stages[stages.length - 1],
                },
              },
            ],
          },
        },
        {
          tokens: [{content: 'done'}],
          result: {text: 'done', content: 'done'},
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['calculate'],
        talentLookup: () =>
          makeTalent('calculate', () => ({type: 'text', summary: '0'})),
        triggerMarkers: [],
        messageId: 'm',
      }),
    );
    const stepFinished = events.find(
      (e): e is Extract<AgentEvent, {type: 'step_finished'}> =>
        e.type === 'step_finished' && !!e.toolCalls && e.toolCalls.length > 0,
    );
    expect(stepFinished).toBeDefined();
    const call = stepFinished!.toolCalls![0];
    expect(call.metrics).toBeDefined();
    expect(call.metrics!.tokens).toBe(stages.length);
    // Duration is wall-clock — assert it's a non-negative finite number
    // rather than a precise value (test scheduling is non-deterministic).
    expect(call.metrics!.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(call.metrics!.durationMs)).toBe(true);
  });

  it('multi-tool steps replicate the step total onto each call', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [
            {
              tool_calls: [
                {
                  id: 'c0',
                  type: 'function',
                  function: {name: 'calculate', arguments: '{}'},
                },
                {
                  id: 'c1',
                  type: 'function',
                  function: {name: 'datetime', arguments: '{}'},
                },
              ],
            },
            {
              tool_calls: [
                {
                  id: 'c0',
                  type: 'function',
                  function: {name: 'calculate', arguments: '{"x":1}'},
                },
                {
                  id: 'c1',
                  type: 'function',
                  function: {name: 'datetime', arguments: '{}'},
                },
              ],
            },
          ],
          result: {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'calculate', arguments: '{"x":1}'},
              },
              {
                id: 'c1',
                type: 'function',
                function: {name: 'datetime', arguments: '{}'},
              },
            ],
          },
        },
        {
          tokens: [{content: 'done'}],
          result: {text: 'done', content: 'done'},
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: ['calculate', 'datetime'],
        talentLookup: name =>
          makeTalent(name, () => ({type: 'text', summary: '0'})),
        triggerMarkers: [],
        messageId: 'm',
      }),
    );
    const stepFinished = events.find(
      (e): e is Extract<AgentEvent, {type: 'step_finished'}> =>
        e.type === 'step_finished' && !!e.toolCalls && e.toolCalls.length > 0,
    );
    expect(stepFinished).toBeDefined();
    const calls = stepFinished!.toolCalls!;
    expect(calls).toHaveLength(2);
    expect(calls[0].metrics?.tokens).toBe(2);
    expect(calls[1].metrics?.tokens).toBe(2);
  });

  it('omits metrics on text-only steps (no tool-call tokens seen)', async () => {
    const engine = makeScriptedEngine({
      scripts: [
        {
          tokens: [{content: 'hi there'}],
          result: {text: 'hi there', content: 'hi there'},
        },
      ],
    });
    const events = await collect(
      runAgent({
        engine,
        initialParams: baseParams,
        allowedTalentNames: [],
        talentLookup: () => undefined,
        triggerMarkers: [],
        messageId: 'm',
      }),
    );
    const stepFinished = events.find(
      (e): e is Extract<AgentEvent, {type: 'step_finished'}> =>
        e.type === 'step_finished',
    );
    expect(stepFinished).toBeDefined();
    expect(stepFinished!.toolCalls).toBeUndefined();
  });
});
