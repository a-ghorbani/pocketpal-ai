import * as React from 'react';
import {Text} from 'react-native';

import {observable, runInAction} from 'mobx';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {defaultDerivedMessageProps} from '../../../../jest/fixtures';

import {Message} from '../Message';
import {MessageType, AgentStep} from '../../../utils/types';

// Replace the icon component used by AssistantTurnFooter so tests
// can render it without pulling in native icon assets.
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const {Text: PaperText} = require('react-native-paper');
  return props => <PaperText>{props.name}</PaperText>;
});

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

// Stub TextMessage so renderer tests focus on per-block layout, not
// internal markdown machinery. The stub records the step prop it was
// rendered with so we can assert "right step → right block". After
// the reasoning split (see ReasoningBlock), TextMessage only renders
// content blocks — reasoning is asserted via mockReasoningBlockCalls.
let mockTextMessageCalls: Array<{step?: AgentStep; messageId: string}> = [];
jest.mock('../../TextMessage/TextMessage', () => {
  return {
    TextMessage: jest.fn((props: any) => {
      mockTextMessageCalls.push({
        step: props.step,
        messageId: props.message?.id,
      });
      return <></>;
    }),
  };
});

// Stub ReasoningBlock so tests can assert reasoning rendering without
// pulling in marked/RenderHtml. The stub records the text it was
// rendered with — that's the only contract Message owes the block.
let mockReasoningBlockCalls: Array<{text: string; autoCollapse?: boolean}> = [];
jest.mock('../../ReasoningBlock/ReasoningBlock', () => {
  return {
    ReasoningBlock: jest.fn((props: any) => {
      mockReasoningBlockCalls.push({
        text: props.text,
        autoCollapse: props.autoCollapse,
      });
      return <></>;
    }),
  };
});

// Stub TalentSurface so renderer tests don't depend on the registry.
let mockTalentSurfaceCalls: Array<{
  step?: AgentStep;
  isActiveRun?: boolean;
  pendingTalentNames?: string[];
  isGeneratingToolCall?: boolean;
}> = [];
jest.mock('../../TalentSurface/TalentSurface', () => {
  const {View, Text: RNText} = require('react-native');
  return {
    TalentSurface: jest.fn((props: any) => {
      mockTalentSurfaceCalls.push({
        step: props.step,
        isActiveRun: props.isActiveRun,
        pendingTalentNames: props.pendingTalentNames,
        isGeneratingToolCall: props.isGeneratingToolCall,
      });
      return (
        <View testID="talent-surface">
          <RNText>{`talent-${props.step?.toolCalls?.[0]?.function?.name ?? 'pending'}`}</RNText>
        </View>
      );
    }),
  };
});

// Avatar uses an Image url derived from author.imageUrl. To keep the
// "avatar renders once" test simple, we don't mock it.

const author = {id: 'assistant-id'};

function makeDerivedTurn(
  steps: AgentStep[],
  overrides: Partial<MessageType.DerivedAssistantTurn> = {},
): MessageType.DerivedAssistantTurn {
  return {
    ...defaultDerivedMessageProps,
    author,
    createdAt: 0,
    id: 'turn-1',
    type: 'assistant_turn',
    steps,
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockTextMessageCalls = [];
  mockTalentSurfaceCalls = [];
  mockReasoningBlockCalls = [];
});

describe('Message — AssistantTurn renderer', () => {
  // ---------- Story Test Requirements (Renderer) #1, #2, #10, #11, #12, #13 ----------

  it('#0 streaming reactivity: in-place mutation of step.content re-renders Message (regression: would fail if `observer` were dropped)', () => {
    // Mirrors the production streaming path: `applyStreamingUpdate` in
    // ChatSessionStore replaces `turn.steps[lastIdx]` with a new spread
    // object inside `runInAction`. The AssistantTurn message reference
    // itself is stable across streaming. If Message used plain
    // React.memo (no observer), this kind of inner mutation wouldn't
    // trigger a re-render and the chat would freeze between status
    // transitions until some unrelated event (keyboard, scroll) shook
    // the tree. Wrapping Message with `observer` from mobx-react keeps
    // the reads of `step.content` tracked so this works correctly.
    const observableTurn = observable.object<MessageType.DerivedAssistantTurn>(
      makeDerivedTurn([{content: 'Hel'}]),
      {},
      {deep: true},
    );
    render(
      <Message
        message={observableTurn}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    expect(mockTextMessageCalls).toHaveLength(1);
    expect(mockTextMessageCalls[0].step?.content).toBe('Hel');

    // Mutate the step in place — same shape as ChatSessionStore's
    // `turn.steps[lastIdx] = {...last, ...partial}`. Wrapped in `act`
    // so React flushes the observer-triggered re-render before we
    // inspect mock calls.
    act(() => {
      runInAction(() => {
        observableTurn.steps[0] = {
          ...observableTurn.steps[0],
          content: 'Hello',
        };
      });
    });

    // observer must have caught the read of `step.content` inside
    // Message → TextMessage during the first render. The mutation
    // schedules a re-render synchronously; React flushes it before
    // the next assertion.
    const latestCall = mockTextMessageCalls[mockTextMessageCalls.length - 1];
    expect(latestCall.step?.content).toBe('Hello');
    expect(mockTextMessageCalls.length).toBeGreaterThan(1);
  });

  it('#1 single-step no-tool turn renders one TextMessage block + no talent block', () => {
    const message = makeDerivedTurn([{content: 'Hello!'}]);
    render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    expect(mockTextMessageCalls).toHaveLength(1);
    expect(mockTextMessageCalls[0].step?.content).toBe('Hello!');
    expect(mockTalentSurfaceCalls).toHaveLength(0);
  });

  it('#2 / #10 multi-step turn renders steps in order: 3 distinct blocks for [{content,toolCalls,toolOutcomes},{content}]', () => {
    const message = makeDerivedTurn([
      {
        content: 'Let me calculate',
        toolCalls: [{id: 'c0', function: {name: 'calculate', arguments: '{}'}}],
        toolOutcomes: [
          {
            callId: 'c0',
            toolName: 'calculate',
            result: {type: 'text', summary: '4'},
            responseContent: '4',
          },
        ],
      },
      {content: 'The answer is 4'},
    ]);
    render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    // Two text blocks (preamble + final), one talent block in between.
    expect(mockTextMessageCalls).toHaveLength(2);
    expect(mockTextMessageCalls[0].step?.content).toBe('Let me calculate');
    expect(mockTextMessageCalls[1].step?.content).toBe('The answer is 4');
    expect(mockTalentSurfaceCalls).toHaveLength(1);
    expect(mockTalentSurfaceCalls[0].step?.toolCalls?.[0].function.name).toBe(
      'calculate',
    );
  });

  it('#11 AssistantTurn occupies ONE FlatList row (renderer returns a single Pressable wrapping all blocks)', () => {
    const message = makeDerivedTurn([
      {content: 'A'},
      {
        toolCalls: [
          {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
        ],
      },
      {content: 'C'},
    ]);
    const {UNSAFE_root} = render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    // Exactly ONE node carries an `onLongPress` prop (the Pressable wrapping
    // the row). This proves long-press routing is turn-level — not split
    // across N step-level rows.
    const longPressables = UNSAFE_root.findAll(
      (n: any) => n.props && typeof n.props.onLongPress === 'function',
    );
    expect(longPressables).toHaveLength(1);
  });

  it('#12 long-press on the row yields the SAME message id regardless of which inner block is targeted', () => {
    const onLongPress = jest.fn();
    const message = makeDerivedTurn([
      {content: 'A'},
      {
        toolCalls: [
          {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
        ],
      },
      {content: 'C'},
    ]);
    const {UNSAFE_root} = render(
      <Message
        message={message}
        messageWidth={440}
        onMessageLongPress={onLongPress}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    const longPressables = UNSAFE_root.findAll(
      (n: any) => n.props && typeof n.props.onLongPress === 'function',
    );
    expect(longPressables).toHaveLength(1);
    fireEvent(longPressables[0], 'longPress', {
      nativeEvent: {pageX: 0, pageY: 0},
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress.mock.calls[0][0].id).toBe('turn-1');
  });

  it('#13 avatar renders once per AssistantTurn (showAvatar=true, showUserAvatars=true)', () => {
    const message = makeDerivedTurn(
      [{content: 'A'}, {content: 'B'}, {content: 'C'}],
      {author: {id: 'assistant-id', firstName: 'Pal'}},
    );
    const {queryAllByTestId, UNSAFE_root} = render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder={false}
        showAvatar
        showName
        showStatus={false}
        showUserAvatars
      />,
    );
    // The Avatar component wraps in a single AvatarContainer when shown.
    const containers = queryAllByTestId('AvatarContainer');
    expect(containers).toHaveLength(1);
    // No avatar duplication across the N step-blocks: only one initials
    // label even when there are 3 visual blocks in the row.
    const initials = UNSAFE_root.findAll(
      (n: any) =>
        n.type === Text &&
        typeof n.props.children === 'string' &&
        n.props.children === 'P',
    );
    expect(initials).toHaveLength(1);
  });

  it('#3 (TalentSurface fixtures) receives step.toolCalls / step.toolOutcomes (not metadata fields) for AssistantTurn', () => {
    const stepWithTalent: AgentStep = {
      content: '',
      toolCalls: [{id: 'c0', function: {name: 'render_html', arguments: '{}'}}],
      toolOutcomes: [
        {
          callId: 'c0',
          toolName: 'render_html',
          result: {type: 'html', html: '<p>x</p>', summary: 'rendered'},
          responseContent: 'rendered',
        },
      ],
    };
    const message = makeDerivedTurn([stepWithTalent]);
    render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    expect(mockTalentSurfaceCalls).toHaveLength(1);
    expect(mockTalentSurfaceCalls[0].step).toEqual(stepWithTalent);
    // No metadata-bag plumbing reaches the renderer.
    // (the message.metadata is empty {}, so the assertion above is
    // already implicit; we just confirm the renderer threads `step` only.)
  });

  it('#4 active run with empty step (no toolCalls) → no TalentSurface (PendingIndicator covers UX, owned by ChatView)', () => {
    // Pending UX is not rendered inline by TalentSurface. The
    // ChatView-owned PendingIndicator covers dead zones; TalentSurface
    // renders only when step.toolCalls is populated.
    const message = makeDerivedTurn([{content: '', partial: true}]);
    render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
        isActiveRun
        activeRunPendingTalentNames={[]}
        isGeneratingToolCall
      />,
    );
    // No TalentSurface rendered because step.toolCalls is empty.
    expect(mockTalentSurfaceCalls).toHaveLength(0);
  });

  it('#5 active run with pendingTalentNames=["calculate"] → no TalentSurface until toolCalls land (PendingIndicator covers UX)', () => {
    const message = makeDerivedTurn([{content: '', partial: true}]);
    render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
        isActiveRun
        activeRunPendingTalentNames={['calculate']}
        isGeneratingToolCall
      />,
    );
    // pendingTalentNames are no longer threaded into TalentSurface;
    // ChatView's PendingIndicator handles the lead-up. The renderer
    // emits no TalentSurface until step.toolCalls is populated.
    expect(mockTalentSurfaceCalls).toHaveLength(0);
  });

  it('#7 reasoning-only step renders a ReasoningBlock (no TextMessage, since content is empty)', () => {
    const message = makeDerivedTurn([
      {content: '', reasoningContent: 'thinking…'},
    ]);
    render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    expect(mockReasoningBlockCalls).toHaveLength(1);
    expect(mockReasoningBlockCalls[0].text).toBe('thinking…');
    expect(mockTextMessageCalls).toHaveLength(0);
  });

  it('renders empty content when AssistantTurn has zero steps', () => {
    const message = makeDerivedTurn([]);
    render(
      <Message
        message={message}
        messageWidth={440}
        onMessagePress={jest.fn()}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    expect(mockTextMessageCalls).toHaveLength(0);
    expect(mockTalentSurfaceCalls).toHaveLength(0);
  });

  // ---------- Canonical scenarios ----------

  describe('canonical scenarios', () => {
    it('A — text only: single TextMessage block, no TalentSurface, ONE footer', () => {
      const message = makeDerivedTurn([{content: 'Hi! How can I help?'}], {
        metadata: {
          timings: {predicted_per_token_ms: 32, predicted_per_second: 30},
          copyable: true,
        },
      });
      const {getAllByTestId, queryByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      expect(mockTextMessageCalls).toHaveLength(1);
      expect(queryByTestId('talent-surface')).toBeNull();
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });

    it('B — datetime tool (no UI registered): TextMessage + TalentSurface (chip path) + TextMessage + ONE footer', () => {
      const message = makeDerivedTurn(
        [
          {
            content: 'Let me check.',
            toolCalls: [
              {id: 'c0', function: {name: 'datetime', arguments: '{}'}},
            ],
            toolOutcomes: [
              {
                callId: 'c0',
                toolName: 'datetime',
                result: {type: 'text', summary: '8:28 AM'},
                responseContent: '8:28 AM',
              },
            ],
          },
          {content: "It's 8:28 AM."},
        ],
        {
          metadata: {
            timings: {predicted_per_second: 30},
            copyable: true,
          },
        },
      );
      const {getAllByTestId, queryAllByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      // Two text blocks (preamble + follow-up)
      expect(mockTextMessageCalls).toHaveLength(2);
      // One TalentSurface invocation for the tool call
      expect(queryAllByTestId('talent-surface')).toHaveLength(1);
      expect(mockTalentSurfaceCalls[0].step?.toolCalls?.[0].function.name).toBe(
        'datetime',
      );
      // Exactly ONE footer per assistant row.
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });

    it('C — render_html with preamble and follow-up: 2 text blocks + 1 talent block + ONE footer', () => {
      const message = makeDerivedTurn(
        [
          {
            content: "Sure, here's a preview.",
            toolCalls: [
              {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
            ],
            toolOutcomes: [
              {
                callId: 'c0',
                toolName: 'render_html',
                result: {
                  type: 'html',
                  html: '<p>preview</p>',
                  summary: 'preview',
                },
                responseContent: 'preview',
              },
            ],
          },
          {content: 'Hope this looks right.'},
        ],
        {metadata: {timings: {predicted_per_second: 30}, copyable: true}},
      );
      const {getAllByTestId, queryAllByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      expect(mockTextMessageCalls).toHaveLength(2);
      expect(queryAllByTestId('talent-surface')).toHaveLength(1);
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });

    it('D — render_html with no preamble: HtmlPreview block + TextMessage + ONE footer (no empty leading bubble)', () => {
      const message = makeDerivedTurn(
        [
          {
            content: '',
            toolCalls: [
              {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
            ],
            toolOutcomes: [
              {
                callId: 'c0',
                toolName: 'render_html',
                result: {
                  type: 'html',
                  html: '<p>x</p>',
                  summary: 'x',
                },
                responseContent: 'x',
              },
            ],
          },
          {content: 'There you go.'},
        ],
        {metadata: {timings: {predicted_per_second: 30}, copyable: true}},
      );
      const {getAllByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      // No empty leading TextMessage — the per-step skip rule §4a
      // collapses zero-block steps. Step 0's content is empty, so
      // only the talent block fires; step 1 supplies the only
      // TextMessage.
      expect(mockTextMessageCalls).toHaveLength(1);
      expect(mockTextMessageCalls[0].step?.content).toBe('There you go.');
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });

    it('E — tool failed: TextMessage(preamble) + TalentSurface (error path) + TextMessage(apology) + ONE footer', () => {
      const message = makeDerivedTurn(
        [
          {
            content: 'Trying...',
            toolCalls: [
              {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
            ],
            toolOutcomes: [
              {
                callId: 'c0',
                toolName: 'render_html',
                result: {
                  type: 'error',
                  summary: 'failed',
                  errorMessage: 'invalid markup',
                },
                responseContent: 'failed',
              },
            ],
          },
          {content: "Sorry, couldn't do that."},
        ],
        {metadata: {timings: {predicted_per_second: 30}, copyable: true}},
      );
      const {getAllByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      expect(mockTextMessageCalls).toHaveLength(2);
      expect(mockTalentSurfaceCalls).toHaveLength(1);
      expect(
        mockTalentSurfaceCalls[0].step?.toolOutcomes?.[0].result.type,
      ).toBe('error');
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });

    it('F — reasoning + content: separate reasoning block + content block + ONE footer (D3)', () => {
      const message = makeDerivedTurn(
        [
          {
            reasoningContent: 'Let me think…',
            content: 'The answer is 42.',
          },
        ],
        {metadata: {timings: {predicted_per_second: 30}, copyable: true}},
      );
      const {getAllByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      // One ReasoningBlock for reasoning + one TextMessage for content.
      // Order: reasoning first, then content. Reasoning is routed
      // through ReasoningBlock, not TextMessage.
      expect(mockReasoningBlockCalls).toHaveLength(1);
      expect(mockReasoningBlockCalls[0].text).toBe('Let me think…');
      expect(mockTextMessageCalls).toHaveLength(1);
      expect(mockTextMessageCalls[0].step?.content).toBe('The answer is 42.');
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });

    it('G — multi-tool in one step: 1 preamble TextMessage + 1 TalentSurface (with both calls) + ONE footer', () => {
      const message = makeDerivedTurn(
        [
          {
            content: 'Here are two:',
            toolCalls: [
              {
                id: 'c1',
                function: {name: 'render_html', arguments: '{}'},
              },
              {
                id: 'c2',
                function: {name: 'render_html', arguments: '{}'},
              },
            ],
            toolOutcomes: [
              {
                callId: 'c1',
                toolName: 'render_html',
                result: {
                  type: 'html',
                  html: '<p>1</p>',
                  summary: '1',
                },
                responseContent: '1',
              },
              {
                callId: 'c2',
                toolName: 'render_html',
                result: {
                  type: 'html',
                  html: '<p>2</p>',
                  summary: '2',
                },
                responseContent: '2',
              },
            ],
          },
        ],
        {metadata: {timings: {predicted_per_second: 30}, copyable: true}},
      );
      const {getAllByTestId, queryAllByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      expect(mockTextMessageCalls).toHaveLength(1);
      // Single TalentSurface invocation per step; the surface itself
      // renders both calls in array order (the block-order assertion
      // lives in TalentSurface.test.tsx).
      expect(queryAllByTestId('talent-surface')).toHaveLength(1);
      const calls = mockTalentSurfaceCalls[0].step?.toolCalls;
      expect(calls?.[0].id).toBe('c1');
      expect(calls?.[1].id).toBe('c2');
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });

    it('multi-tool partial completion: step₀ has two calls, first ok + second error → both rendered in array order via TalentSurface, ONE footer', () => {
      // One talent block (A) followed by one error block (B), in array
      // order. Both surface simultaneously after step_finished —
      // asserted here at the Message-renderer level by checking
      // TalentSurface receives both calls + outcomes in the right
      // order. Per-block dispatch (talent UI vs error block) lives in
      // TalentSurface.test.tsx.
      const message = makeDerivedTurn(
        [
          {
            content: 'Trying both tools:',
            toolCalls: [
              {
                id: 'c1',
                function: {name: 'render_html', arguments: '{}'},
              },
              {
                id: 'c2',
                function: {name: 'render_html', arguments: '{}'},
              },
            ],
            toolOutcomes: [
              {
                callId: 'c1',
                toolName: 'render_html',
                result: {type: 'html', html: '<p>ok</p>', summary: 'ok'},
                responseContent: 'ok',
              },
              {
                callId: 'c2',
                toolName: 'render_html',
                result: {
                  type: 'error',
                  summary: 'failed',
                  errorMessage: 'invalid markup',
                },
                responseContent: 'failed',
              },
            ],
          },
          {content: 'One worked, one did not.'},
        ],
        {metadata: {timings: {predicted_per_second: 30}, copyable: true}},
      );
      const {getAllByTestId, queryAllByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      // Two text blocks (preamble + apology), one TalentSurface for
      // step₀.
      expect(mockTextMessageCalls).toHaveLength(2);
      expect(queryAllByTestId('talent-surface')).toHaveLength(1);
      // Both calls reach TalentSurface in array order. The
      // surface-level dispatch is tested in TalentSurface.test.tsx —
      // here we verify the renderer doesn't drop calls or shuffle order.
      const calls = mockTalentSurfaceCalls[0].step?.toolCalls;
      const outcomes = mockTalentSurfaceCalls[0].step?.toolOutcomes;
      expect(calls?.[0].id).toBe('c1');
      expect(calls?.[1].id).toBe('c2');
      expect(outcomes?.[0].result.type).toBe('html');
      expect(outcomes?.[1].result.type).toBe('error');
      // Exactly ONE footer per assistant row.
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });

    it('multi-step turn renders exactly ONE AssistantTurnFooter', () => {
      const message = makeDerivedTurn(
        [
          {content: 'A'},
          {
            toolCalls: [
              {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
            ],
            toolOutcomes: [
              {
                callId: 'c0',
                toolName: 'render_html',
                result: {type: 'html', html: '<p>x</p>', summary: 'x'},
                responseContent: 'x',
              },
            ],
          },
          {content: 'B'},
          {content: 'C'},
        ],
        {metadata: {timings: {predicted_per_second: 30}, copyable: true}},
      );
      const {getAllByTestId} = render(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn()}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );
      expect(getAllByTestId('assistant-turn-footer')).toHaveLength(1);
    });
  });
});
