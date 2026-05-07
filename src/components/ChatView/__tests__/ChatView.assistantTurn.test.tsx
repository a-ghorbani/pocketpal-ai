import * as React from 'react';
import {runInAction} from 'mobx';

import {textMessage, user} from '../../../../jest/fixtures';
import {render, fireEvent} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {MessageType, AgentStep} from '../../../utils/types';
import {chatSessionStore, modelStore} from '../../../store';

import {ChatView} from '../ChatView';

jest.useFakeTimers();

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

const author = {id: 'assistant-id'};

function makeAssistantTurn(
  steps: AgentStep[],
  id: string,
  ts: number,
): MessageType.AssistantTurn {
  return {
    id,
    type: 'assistant_turn',
    author,
    createdAt: ts,
    steps,
    metadata: {copyable: true},
  };
}

const htmlOutcome = (callId: string) => ({
  callId,
  toolName: 'render_html',
  result: {
    type: 'html' as const,
    html: '<p>x</p>',
    summary: 'rendered',
  },
  responseContent: 'rendered',
});

beforeEach(() => {
  jest.clearAllMocks();
  runInAction(() => {
    modelStore.activeModelId = 'test-model';
    chatSessionStore.agentUiState = {
      status: 'idle',
      pendingTalentNames: [],
      pendingToolTokens: 0,
      hitMaxTurns: false,
    };
  });
});

describe('ChatView — AssistantTurn integration', () => {
  // ---------- Story Test Requirements (Renderer) #6 + #11 ----------

  it('#6 htmlPreviewCount counts step.toolOutcomes filtered to result.type=html across all turns', () => {
    const turn1 = makeAssistantTurn(
      [
        {
          toolCalls: [
            {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
          ],
          toolOutcomes: [htmlOutcome('c0')],
        },
      ],
      't1',
      4,
    );
    const turn2 = makeAssistantTurn(
      [
        {
          toolCalls: [
            {id: 'c1', function: {name: 'render_html', arguments: '{}'}},
          ],
          toolOutcomes: [htmlOutcome('c1')],
        },
      ],
      't2',
      3,
    );
    const turn3 = makeAssistantTurn(
      [
        {
          toolCalls: [
            {id: 'c2', function: {name: 'render_html', arguments: '{}'}},
          ],
          toolOutcomes: [htmlOutcome('c2')],
        },
      ],
      't3',
      2,
    );
    const turn4 = makeAssistantTurn(
      [
        {
          toolCalls: [
            {id: 'c3', function: {name: 'render_html', arguments: '{}'}},
          ],
          toolOutcomes: [htmlOutcome('c3')],
        },
      ],
      't4',
      1,
    );

    const messages = [turn1, turn2, turn3, turn4];
    const {getByTestId} = render(
      <ChatView messages={messages} onSendPress={jest.fn()} user={user} />,
      {withNavigation: true, withBottomSheetProvider: true},
    );
    // Soft cap fires at >= 4 — banner is visible.
    expect(getByTestId('soft-cap-warning')).toBeTruthy();
  });

  it('#6b under threshold: 3 html outcomes → no soft-cap banner', () => {
    const messages = [
      makeAssistantTurn(
        [
          {
            toolCalls: [
              {id: 'c0', function: {name: 'render_html', arguments: '{}'}},
            ],
            toolOutcomes: [htmlOutcome('c0')],
          },
        ],
        't1',
        3,
      ),
      makeAssistantTurn(
        [
          {
            toolCalls: [
              {id: 'c1', function: {name: 'render_html', arguments: '{}'}},
            ],
            toolOutcomes: [htmlOutcome('c1')],
          },
        ],
        't2',
        2,
      ),
      makeAssistantTurn(
        [
          {
            toolCalls: [
              {id: 'c2', function: {name: 'render_html', arguments: '{}'}},
            ],
            toolOutcomes: [htmlOutcome('c2')],
          },
        ],
        't3',
        1,
      ),
    ];
    const {queryByTestId} = render(
      <ChatView messages={messages} onSendPress={jest.fn()} user={user} />,
      {withNavigation: true, withBottomSheetProvider: true},
    );
    expect(queryByTestId('soft-cap-warning')).toBeNull();
  });

  it('#6c text-result outcomes do NOT count toward htmlPreviewCount', () => {
    const messages = Array.from({length: 6}, (_, i) =>
      makeAssistantTurn(
        [
          {
            toolCalls: [
              {id: `c${i}`, function: {name: 'calculate', arguments: '{}'}},
            ],
            toolOutcomes: [
              {
                callId: `c${i}`,
                toolName: 'calculate',
                result: {type: 'text', summary: '0'} as const,
                responseContent: '0',
              },
            ],
          },
        ],
        `t${i}`,
        100 - i,
      ),
    );
    const {queryByTestId} = render(
      <ChatView messages={messages} onSendPress={jest.fn()} user={user} />,
      {withNavigation: true, withBottomSheetProvider: true},
    );
    expect(queryByTestId('soft-cap-warning')).toBeNull();
  });

  it('long-press on assistant_turn message opens the menu (interaction Test #7)', () => {
    const turn = makeAssistantTurn([{content: 'hi assistant'}], 't1', 1);
    const userMsg: MessageType.Text = {
      ...textMessage,
      id: 'u1',
      text: 'user prompt',
      author: user,
      createdAt: 0,
    };
    const externalLongPress = jest.fn();
    const {UNSAFE_root, getByText} = render(
      <ChatView
        messages={[turn, userMsg]}
        onSendPress={jest.fn()}
        onMessageLongPress={externalLongPress}
        user={user}
      />,
      {withNavigation: true, withBottomSheetProvider: true},
    );

    // The Message renderer wraps the row in a single Pressable. Find
    // it by walking the tree for an onLongPress handler attached to a
    // node whose subtree contains the assistant turn's text content
    // (so we don't accidentally trigger the user message's pressable).
    const longPressables = UNSAFE_root.findAll(
      (n: any) => n.props && typeof n.props.onLongPress === 'function',
    );
    // Find the one whose subtree contains 'hi assistant'.
    const target = longPressables.find((node: any) => {
      const findText = (n: any): boolean => {
        if (!n) return false;
        if (typeof n.children === 'string')
          return n.children.includes('hi assistant');
        if (typeof n.props?.children === 'string')
          return n.props.children.includes('hi assistant');
        if (Array.isArray(n.children)) return n.children.some(findText);
        if (n.children) return findText(n.children);
        return false;
      };
      return findText(node);
    });
    expect(target).toBeTruthy();
    fireEvent(target!, 'longPress', {nativeEvent: {pageX: 1, pageY: 1}});
    // External callback fires on every long-press, regardless of type.
    expect(externalLongPress).toHaveBeenCalledTimes(1);
    expect(externalLongPress.mock.calls[0][0].type).toBe('assistant_turn');
    expect(externalLongPress.mock.calls[0][0].id).toBe('t1');

    // The long-press also opens the menu — Copy label appears.
    expect(getByText(l10n.en.components.chatView.menuItems.copy)).toBeTruthy();
  });
});

describe('ChatView — Copy menu item label is present in l10n', () => {
  it('exposes a Copy menu label (sanity for menuItems)', () => {
    expect(l10n.en.components.chatView.menuItems.copy).toBeTruthy();
  });
});

// ---------- Canonical scenario H + I ----------

describe('ChatView — Scenario H (abort with partial content)', () => {
  it('H — interrupted turn with copyable but no timings: AssistantTurnFooter shows copy alone, no timing', () => {
    const turn: MessageType.AssistantTurn = {
      id: 't1',
      type: 'assistant_turn',
      author,
      createdAt: 1,
      steps: [{content: 'I was about to say...', partial: true}],
      metadata: {interrupted: true, copyable: true},
    };
    const {getByTestId, queryByTestId} = render(
      <ChatView messages={[turn]} onSendPress={jest.fn()} user={user} />,
      {withNavigation: true, withBottomSheetProvider: true},
    );
    expect(getByTestId('assistant-turn-footer')).toBeTruthy();
    // Copy renders (copyable=true).
    expect(getByTestId('footer-copy')).toBeTruthy();
    // No timing line — `metadata.timings` is absent (D1 / Scenario H).
    expect(queryByTestId('footer-timing')).toBeNull();
  });
});

describe('ChatView — Scenario I (dead-zone phase walk via PendingIndicator)', () => {
  // The PendingIndicator (D4 / I4) is owned by ChatView and gated on
  // `chatSessionStore.agentUiState.status`. The §3 table says it
  // appears in every status EXCEPT streaming_text and done. Drive
  // the status across that table and assert testID presence /
  // absence per phase.
  const phases: Array<{label: string; status: any; visible: boolean}> = [
    {label: 'idle (no run)', status: 'idle', visible: false},
    {label: 'phase 2 / 7: prefill', status: 'prefill', visible: true},
    {
      label: 'phase 3 / 8: streaming_text',
      status: 'streaming_text',
      visible: false,
    },
    {
      label: 'phase 4: generating_tool_call',
      status: 'generating_tool_call',
      visible: true,
    },
    {label: 'phase 5: executing_tool', status: 'executing_tool', visible: true},
    {label: 'phase 9: done', status: 'done', visible: false},
    {label: 'failed', status: 'failed', visible: false},
  ];

  it.each(phases)(
    '$label → indicator visible=$visible',
    ({status, visible}) => {
      runInAction(() => {
        chatSessionStore.agentUiState = {
          status,
          pendingTalentNames: [],
          pendingToolTokens: 0,
          hitMaxTurns: false,
        };
      });
      const turn = makeAssistantTurn([{content: 'hi'}], 't1', 1);
      const {queryByTestId} = render(
        <ChatView messages={[turn]} onSendPress={jest.fn()} user={user} />,
        {withNavigation: true, withBottomSheetProvider: true},
      );
      if (visible) {
        expect(queryByTestId('pending-indicator')).toBeTruthy();
      } else {
        expect(queryByTestId('pending-indicator')).toBeNull();
      }
    },
  );

  it('PendingIndicator no-flicker: streaming_text → re-render after rapid token bursts keeps indicator hidden', () => {
    // Wiring test. The reducer-level test (agentStateReducer.test.ts
    // PendingIndicator no-flicker invariant) proves the predicate
    // stays stable; this test proves ChatView wires the predicate
    // to the indicator correctly. We simulate the user-perceived
    // worst case: status starts in streaming_text (we already
    // crossed prefill → streaming_text on the first token), then
    // re-renders happen on every subsequent token. The indicator
    // must stay hidden across all re-renders.
    runInAction(() => {
      chatSessionStore.agentUiState = {
        status: 'streaming_text',
        pendingTalentNames: [],
        pendingToolTokens: 0,
        hitMaxTurns: false,
      };
    });
    const turn = makeAssistantTurn([{content: 'h'}], 't1', 1);
    const {queryByTestId, rerender} = render(
      <ChatView messages={[turn]} onSendPress={jest.fn()} user={user} />,
      {withNavigation: true, withBottomSheetProvider: true},
    );
    expect(queryByTestId('pending-indicator')).toBeNull();

    // 10 simulated re-renders, each representing a token landing.
    // The status remains streaming_text the whole time (no flips
    // back to prefill — that's the reducer-level guarantee). Each
    // re-render passes a new turn message reference (content
    // grows), forcing React to re-evaluate the header component.
    let content = 'h';
    for (let i = 0; i < 10; i++) {
      content += 'x';
      const updatedTurn = makeAssistantTurn([{content}], 't1', 1);
      rerender(
        <ChatView
          messages={[updatedTurn]}
          onSendPress={jest.fn()}
          user={user}
        />,
      );
      // Indicator MUST remain hidden across every frame — no
      // flicker is observable.
      expect(queryByTestId('pending-indicator')).toBeNull();
    }
  });
});
