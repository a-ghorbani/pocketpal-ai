import * as React from 'react';
import {Text} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';
import {defaultDerivedMessageProps} from '../../../../jest/fixtures';

import {Message} from '../Message';
import {MessageType, AgentStep} from '../../../utils/types';

// Stub TextMessage so renderer tests focus on per-block layout, not
// internal markdown machinery. The stub records the step prop it was
// rendered with so we can assert "right step → right block".
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
});

describe('Message — AssistantTurn renderer', () => {
  // ---------- Story Test Requirements (Renderer) #1, #2, #10, #11, #12, #13 ----------

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

  it('#4 active run with empty pendingTalentNames + isGeneratingToolCall=true → renders generic pending UI', () => {
    // Active run shape: a single step with toolCalls already parsed
    // OR an empty step that still exists. Here we use the empty-step
    // case where the renderer is told to show the generic pending UI.
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
    // Talent block fires when the active step is generating a tool call
    // even before tool_calls land — generic pending copy is shown by
    // TalentSurface.
    expect(mockTalentSurfaceCalls).toHaveLength(1);
    expect(mockTalentSurfaceCalls[0].isActiveRun).toBe(true);
    expect(mockTalentSurfaceCalls[0].isGeneratingToolCall).toBe(true);
    expect(mockTalentSurfaceCalls[0].pendingTalentNames).toEqual([]);
  });

  it('#5 active run with pendingTalentNames=["calculate"] → talent surface receives the names', () => {
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
    expect(mockTalentSurfaceCalls).toHaveLength(1);
    expect(mockTalentSurfaceCalls[0].pendingTalentNames).toEqual(['calculate']);
  });

  it('#7 reasoning-only step still renders a TextMessage block (so the per-step reasoningContent surfaces)', () => {
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
    expect(mockTextMessageCalls).toHaveLength(1);
    expect(mockTextMessageCalls[0].step?.reasoningContent).toBe('thinking…');
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
});
