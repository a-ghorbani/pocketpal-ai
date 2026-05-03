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
      <ChatView
        messages={messages}
        onSendPress={jest.fn()}
        user={user}
      />,
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
      <ChatView
        messages={messages}
        onSendPress={jest.fn()}
        user={user}
      />,
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
      <ChatView
        messages={messages}
        onSendPress={jest.fn()}
        user={user}
      />,
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
      (n: any) =>
        n.props && typeof n.props.onLongPress === 'function',
    );
    // Find the one whose subtree contains 'hi assistant'.
    const target = longPressables.find((node: any) => {
      const findText = (n: any): boolean => {
        if (!n) return false;
        if (typeof n.children === 'string') return n.children.includes('hi assistant');
        if (typeof n.props?.children === 'string')
          return n.props.children.includes('hi assistant');
        if (Array.isArray(n.children))
          return n.children.some(findText);
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
