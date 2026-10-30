import React from 'react';
import {StyleSheet} from 'react-native';
import {runInAction} from 'mobx';
import {Text} from 'react-native-paper';

import {act, render, fireEvent, within} from '../../../../jest/test-utils';

import {l10n} from '../../../locales';
import {chatSessionStore, ttsStore} from '../../../store';
import {assistant} from '../../../utils/chat';
import {PlayButton, shouldShowPlayButton} from '../../TextMessage/PlayButton';

import {AssistantTurnFooter} from '../AssistantTurnFooter';
import {streamFinishChunk} from '../../../../jest/fixtures/llamaServerWire';

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

const baseTurn = (overrides: Partial<any> = {}): any => ({
  author: {id: 'assistant'},
  createdAt: 0,
  id: 'turn-1',
  type: 'assistant_turn',
  steps: [{content: 'Hello'}],
  metadata: {},
  ...overrides,
});

const footerChildIds = (footer: any): string[] =>
  React.Children.toArray(footer.props.children)
    .map((child: any) => child.props?.testID ?? child.type?.name)
    .filter(Boolean);

describe('AssistantTurnFooter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing on the active row when neither timings nor copyable are set', () => {
    const message = baseTurn({metadata: {}});
    const {queryByTestId} = render(
      <AssistantTurnFooter message={message} isActiveRun />,
    );
    expect(queryByTestId('assistant-turn-footer')).toBeNull();
  });

  describe('message menu button', () => {
    it('renders a footer holding only the button on a finished row with no other part', () => {
      const {getByTestId, queryByTestId} = render(
        <AssistantTurnFooter message={baseTurn({metadata: {}})} />,
      );
      expect(getByTestId('assistant-turn-footer')).toBeTruthy();
      expect(getByTestId('message-menu-button')).toBeTruthy();
      expect(queryByTestId('footer-copy')).toBeNull();
    });

    it('renders on a system row without copyable', () => {
      const system = baseTurn({
        type: 'text',
        text: 'Context is full',
        metadata: {system: true},
      });
      const {getByTestId} = render(<AssistantTurnFooter message={system} />);
      expect(getByTestId('message-menu-button')).toBeTruthy();
    });

    it('places the button after Copy', () => {
      const {getByTestId} = render(
        <AssistantTurnFooter
          message={baseTurn({metadata: {copyable: true}})}
        />,
      );
      const ids = footerChildIds(getByTestId('assistant-turn-footer'));
      expect(ids.indexOf('footer-copy')).toBeLessThan(
        ids.indexOf('MessageMenuButton'),
      );
      expect(ids[ids.length - 1]).toBe('MessageMenuButton');
    });

    it('keeps the button after a text group that shrinks and wraps', () => {
      const message = baseTurn({
        metadata: {
          copyable: true,
          interrupted: true,
          timings: {
            ...streamFinishChunk.timings,
            time_to_first_token_ms: 150,
            draft_tokens: 12,
            draft_tokens_accepted: 9,
          },
          completionResult: {used: 0, contextFull: false, isRemote: true},
        },
      });
      const {getByTestId, UNSAFE_getAllByType} = render(
        <AssistantTurnFooter message={message} />,
      );

      const group = getByTestId('footer-text-group');
      for (const id of [
        'footer-timing',
        'message-draft-tokens',
        'footer-interrupted-status',
      ]) {
        expect(within(group).getByTestId(id)).toBeTruthy();
      }
      const groupStyle = StyleSheet.flatten(group.props.style);
      expect(groupStyle).toMatchObject({
        flexShrink: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
      });
      expect(groupStyle.flexGrow).toBeUndefined();
      expect(groupStyle.flex).toBeUndefined();
      for (const text of UNSAFE_getAllByType(Text)) {
        expect(text.props.numberOfLines).toBeUndefined();
      }

      const ids = footerChildIds(getByTestId('assistant-turn-footer'));
      expect(ids.slice(-3)).toEqual([
        'footer-copy',
        'footer-text-group',
        'MessageMenuButton',
      ]);
      const buttonStyle = StyleSheet.flatten(
        getByTestId('message-menu-button').props.style,
      );
      expect(buttonStyle.flexShrink).toBe(0);
    });

    it('renders no text group when the footer has no text', () => {
      const {queryByTestId} = render(
        <AssistantTurnFooter
          message={baseTurn({metadata: {copyable: true}})}
        />,
      );
      expect(queryByTestId('footer-text-group')).toBeNull();
    });

    it('gives Copy a labelled 44 dp box that keeps the line height', () => {
      const {getByTestId} = render(
        <AssistantTurnFooter
          message={baseTurn({metadata: {copyable: true}})}
        />,
      );
      const copy = getByTestId('footer-copy');
      const style = StyleSheet.flatten(copy.props.style);

      expect(copy.props.accessibilityRole).toBe('button');
      expect(copy.props.accessibilityLabel).toBe(
        l10n.en.components.chatView.menuItems.copy,
      );
      expect(style).toMatchObject({
        minWidth: 44,
        minHeight: 44,
        marginVertical: -14,
        flexShrink: 0,
      });
      expect(style.marginTop ?? style.marginVertical).toBe(-14);
      expect(style.marginBottom ?? style.marginVertical).toBe(-14);
      expect(style.marginStart).toBe(-14);
      for (const key of [
        'margin',
        'marginHorizontal',
        'marginLeft',
        'marginRight',
        'marginEnd',
      ] as const) {
        expect(style[key] ?? 0).toBe(0);
      }
    });

    it('starts the button box at the right edge of the Copy box', () => {
      const {getByTestId} = render(
        <AssistantTurnFooter
          message={baseTurn({metadata: {copyable: true}})}
        />,
      );
      const footerGap = StyleSheet.flatten(
        getByTestId('assistant-turn-footer').props.style,
      ).gap;
      const buttonMarginLeft = StyleSheet.flatten(
        getByTestId('message-menu-button').props.style,
      ).marginLeft;

      expect(
        footerChildIds(getByTestId('assistant-turn-footer')).slice(-2),
      ).toEqual(['footer-copy', 'MessageMenuButton']);
      expect(Number(footerGap) + Number(buttonMarginLeft)).toBe(0);
    });

    it('is hidden on the active row while other parts still show', () => {
      const {getByTestId, queryByTestId} = render(
        <AssistantTurnFooter
          message={baseTurn({metadata: {copyable: true}})}
          isActiveRun
        />,
      );
      expect(getByTestId('footer-copy')).toBeTruthy();
      expect(queryByTestId('message-menu-button')).toBeNull();
    });

    it('forwards the press event', () => {
      const onMenuPress = jest.fn();
      const {getByTestId} = render(
        <AssistantTurnFooter
          message={baseTurn({metadata: {}})}
          onMenuPress={onMenuPress}
        />,
      );
      const event = {nativeEvent: {pageX: 3, pageY: 4}};
      fireEvent.press(getByTestId('message-menu-button'), event);
      expect(onMenuPress).toHaveBeenCalledWith(event);
    });
  });

  describe('Play and Copy', () => {
    const speakableTurn = baseTurn({
      author: {id: assistant.id},
      steps: [{content: 'Here is a longer reply.'}],
      metadata: {copyable: true},
    });

    const playButtonType = (PlayButton as unknown as {type: React.FC}).type;

    const copyMarginStart = (getByTestId: (id: string) => any) =>
      StyleSheet.flatten(getByTestId('footer-copy').props.style).marginStart ??
      0;

    afterEach(() => {
      runInAction(() => {
        ttsStore.deviceMeetsMemory = false;
        ttsStore.userTTSOverride = null;
      });
    });

    it('hides Play and pulls Copy to the leading edge when the predicate is false', () => {
      const {getByTestId, UNSAFE_queryByType} = render(
        <AssistantTurnFooter message={speakableTurn} />,
      );
      expect(shouldShowPlayButton(speakableTurn)).toBe(false);
      expect(UNSAFE_queryByType(playButtonType)).toBeNull();
      expect(copyMarginStart(getByTestId)).toBe(-14);
    });

    it('renders Play and leaves Copy unshifted when the predicate is true', () => {
      runInAction(() => {
        ttsStore.deviceMeetsMemory = true;
      });
      const {getByTestId, UNSAFE_queryByType} = render(
        <AssistantTurnFooter message={speakableTurn} />,
      );
      expect(shouldShowPlayButton(speakableTurn)).toBe(true);
      expect(UNSAFE_queryByType(playButtonType)).not.toBeNull();
      expect(copyMarginStart(getByTestId)).toBe(0);
    });

    it('adds Play and clears the Copy offset in the same render when TTS turns on', () => {
      const {getByTestId, UNSAFE_queryByType} = render(
        <AssistantTurnFooter message={speakableTurn} />,
      );
      expect(UNSAFE_queryByType(playButtonType)).toBeNull();
      expect(copyMarginStart(getByTestId)).toBe(-14);

      act(() => {
        runInAction(() => {
          ttsStore.userTTSOverride = true;
        });
      });

      expect(UNSAFE_queryByType(playButtonType)).not.toBeNull();
      expect(copyMarginStart(getByTestId)).toBe(0);
    });
  });

  it('renders timing line when timings present (no copy button if not copyable)', () => {
    const message = baseTurn({
      metadata: {
        timings: {predicted_per_token_ms: 10, predicted_per_second: 100},
      },
    });
    const {getByText, queryByTestId} = render(
      <AssistantTurnFooter message={message} />,
    );
    expect(queryByTestId('assistant-turn-footer')).toBeTruthy();
    expect(getByText('10ms/token, 100.00 tokens/sec')).toBeTruthy();
    expect(queryByTestId('footer-copy')).toBeNull();
  });

  it('renders prompt speed and cached tokens from a server finish chunk', () => {
    const message = baseTurn({
      metadata: {
        timings: {...streamFinishChunk.timings, time_to_first_token_ms: 150},
        completionResult: {used: 0, contextFull: false, isRemote: true},
      },
    });
    const {getByTestId} = render(<AssistantTurnFooter message={message} />);
    expect(getByTestId('footer-timing').props.children).toBe(
      '6ms/token, 170.35 tokens/sec, 126.90 prompt tokens/sec, 15 cached, 150ms TTFT',
    );
  });

  it('leaves out the parts a build does not report', () => {
    const message = baseTurn({
      metadata: {
        timings: {
          predicted_per_token_ms: 10,
          predicted_per_second: 100,
          time_to_first_token_ms: 150,
        },
        // Remote, so the origin gate passes and the absence under test is the
        // server's silence rather than the gate withholding them.
        completionResult: {used: 0, contextFull: false, isRemote: true},
      },
    });
    const {getByTestId} = render(<AssistantTurnFooter message={message} />);
    expect(getByTestId('footer-timing').props.children).toBe(
      '10ms/token, 100.00 tokens/sec, 150ms TTFT',
    );
  });

  it('separates a cold prompt cache from a build that never reports one', () => {
    const cold = baseTurn({
      metadata: {
        timings: {predicted_per_token_ms: 10, cache_n: 0},
        completionResult: {used: 0, contextFull: false, isRemote: true},
      },
    });
    expect(
      render(<AssistantTurnFooter message={cold} />).getByTestId(
        'footer-timing',
      ).props.children,
    ).toBe('10ms/token, 0 cached');

    const silent = baseTurn({
      metadata: {
        timings: {predicted_per_token_ms: 10},
        completionResult: {used: 0, contextFull: false, isRemote: true},
      },
    });
    expect(
      render(<AssistantTurnFooter message={silent} />).getByTestId(
        'footer-timing',
      ).props.children,
    ).toBe('10ms/token');
  });

  // A row stored before timings were normalised on write holds whatever the
  // server sent, and the two bad shapes failed differently: a string threw in
  // render, a NaN printed itself.
  it('renders no part for a stored value that is a string', () => {
    const message = baseTurn({
      metadata: {
        timings: {predicted_per_second: 'NaN', cache_n: 3},
        completionResult: {used: 0, contextFull: false, isRemote: true},
      },
    });
    expect(
      render(<AssistantTurnFooter message={message} />).getByTestId(
        'footer-timing',
      ).props.children,
    ).toBe('3 cached');
  });

  it('renders no part for a stored NaN', () => {
    const message = baseTurn({
      metadata: {
        timings: {
          predicted_per_token_ms: NaN,
          prompt_per_second: NaN,
          cache_n: 3,
        },
        completionResult: {used: 0, contextFull: false, isRemote: true},
      },
    });
    expect(
      render(<AssistantTurnFooter message={message} />).getByTestId(
        'footer-timing',
      ).props.children,
    ).toBe('3 cached');
  });

  it('keeps prompt speed and cached tokens off a local turn that reports them', () => {
    const timings = {...streamFinishChunk.timings, time_to_first_token_ms: 150};
    expect(timings.prompt_per_second).toBeDefined();
    expect(timings.cache_n).toBeDefined();

    const local = baseTurn({
      metadata: {
        timings,
        completionResult: {used: 0, contextFull: false, isRemote: false},
      },
    });
    expect(
      render(<AssistantTurnFooter message={local} />).getByTestId(
        'footer-timing',
      ).props.children,
    ).toBe('6ms/token, 170.35 tokens/sec, 150ms TTFT');

    const remote = baseTurn({
      metadata: {
        timings,
        completionResult: {used: 0, contextFull: false, isRemote: true},
      },
    });
    expect(
      render(<AssistantTurnFooter message={remote} />).getByTestId(
        'footer-timing',
      ).props.children,
    ).toBe(
      '6ms/token, 170.35 tokens/sec, 126.90 prompt tokens/sec, 15 cached, 150ms TTFT',
    );
  });

  it('renders copy button when copyable, even if timings absent (abort path)', () => {
    const message = baseTurn({
      metadata: {copyable: true, interrupted: true},
    });
    const {queryByTestId} = render(<AssistantTurnFooter message={message} />);
    expect(queryByTestId('assistant-turn-footer')).toBeTruthy();
    expect(queryByTestId('footer-copy')).toBeTruthy();
    expect(queryByTestId('footer-timing')).toBeNull();
  });

  it('renders both timing and copy when both fields present', () => {
    const message = baseTurn({
      metadata: {
        copyable: true,
        timings: {predicted_per_token_ms: 32, predicted_per_second: 30},
      },
    });
    const {getByText, queryByTestId} = render(
      <AssistantTurnFooter message={message} />,
    );
    expect(getByText('32ms/token, 30.00 tokens/sec')).toBeTruthy();
    expect(queryByTestId('footer-copy')).toBeTruthy();
  });

  it('copy button copies derived text via Clipboard.setString', () => {
    const message = baseTurn({
      steps: [{content: 'Sure, here it is.'}, {content: 'Hope this helps.'}],
      metadata: {
        copyable: true,
        timings: {predicted_per_second: 50},
      },
    });
    const {getByTestId} = render(<AssistantTurnFooter message={message} />);
    fireEvent.press(getByTestId('footer-copy'));
    expect(
      require('@react-native-clipboard/clipboard').setString,
    ).toHaveBeenCalledWith('Sure, here it is.\n\nHope this helps.');
  });

  it('copy button is a no-op for unsupported message types', () => {
    const message = {
      author: {id: 'assistant'},
      createdAt: 0,
      id: 'img-1',
      type: 'image' as const,
      uri: 'file://foo.png',
      width: 10,
      height: 10,
      size: 100,
      name: 'foo.png',
      metadata: {copyable: true},
    } as any;
    const {getByTestId} = render(<AssistantTurnFooter message={message} />);
    fireEvent.press(getByTestId('footer-copy'));
    expect(
      require('@react-native-clipboard/clipboard').setString,
    ).not.toHaveBeenCalled();
  });

  it('renders TTFT-only timing string when only ttft is present', () => {
    const message = baseTurn({
      metadata: {
        timings: {time_to_first_token_ms: 150},
      },
    });
    const {getByText} = render(<AssistantTurnFooter message={message} />);
    expect(getByText('150ms TTFT')).toBeTruthy();
  });

  it('does not render the timing Text when timings are empty (no parts to show)', () => {
    const message = baseTurn({
      metadata: {
        copyable: true,
        timings: {},
      },
    });
    const {queryByTestId} = render(<AssistantTurnFooter message={message} />);
    expect(queryByTestId('footer-timing')).toBeNull();
    expect(queryByTestId('footer-copy')).toBeTruthy();
  });

  it('renders draft acceptance when speculative draft_tokens > 0', () => {
    const message = baseTurn({
      metadata: {
        timings: {
          predicted_per_second: 80,
          draft_tokens: 12,
          draft_tokens_accepted: 9,
        },
      },
    });
    const {getByTestId, getByText} = render(
      <AssistantTurnFooter message={message} />,
    );
    expect(getByTestId('message-draft-tokens')).toBeTruthy();
    expect(getByText('draft: 9/12 (75%)')).toBeTruthy();
  });

  it('does not render draft acceptance when draft_tokens is 0', () => {
    const message = baseTurn({
      metadata: {
        timings: {
          predicted_per_second: 80,
          draft_tokens: 0,
          draft_tokens_accepted: 0,
        },
      },
    });
    const {queryByTestId} = render(<AssistantTurnFooter message={message} />);
    expect(queryByTestId('message-draft-tokens')).toBeNull();
  });

  it('does not render draft acceptance when draft_tokens is absent (non-speculative turn)', () => {
    const message = baseTurn({
      metadata: {timings: {predicted_per_second: 80}},
    });
    const {queryByTestId} = render(<AssistantTurnFooter message={message} />);
    expect(queryByTestId('message-draft-tokens')).toBeNull();
  });

  it('renders "Interrupted" status when metadata.interrupted is set', () => {
    const message = baseTurn({
      metadata: {copyable: true, interrupted: true},
    });
    const {getByTestId, getByText} = render(
      <AssistantTurnFooter message={message} />,
    );
    expect(getByTestId('footer-interrupted-status')).toBeTruthy();
    expect(getByText('Interrupted')).toBeTruthy();
  });

  it('upgrades the status to "Cut off — likely context full" when truncationLikely is set', () => {
    const message = baseTurn({
      metadata: {copyable: true, interrupted: true, truncationLikely: true},
    });
    const {getByTestId, getByText} = render(
      <AssistantTurnFooter message={message} />,
    );
    expect(getByTestId('footer-interrupted-status')).toBeTruthy();
    expect(getByText('Cut off — likely context full')).toBeTruthy();
  });

  it('renders the footer for interrupted-only turns (no copyable, no timings)', () => {
    // Defensive: the footer should still surface the failure even if
    // the rollback path forgot to set `copyable`.
    const message = baseTurn({metadata: {interrupted: true}});
    const {queryByTestId} = render(<AssistantTurnFooter message={message} />);
    expect(queryByTestId('assistant-turn-footer')).toBeTruthy();
    expect(queryByTestId('footer-interrupted-status')).toBeTruthy();
    expect(queryByTestId('footer-copy')).toBeNull();
    expect(queryByTestId('footer-timing')).toBeNull();
  });

  describe('context-full banner / footer non-duplication', () => {
    afterEach(() => {
      runInAction(() => {
        chatSessionStore.lastCompletionResult = undefined;
      });
    });

    it('suppresses the "cut off" footer text when the context-full banner owns this turn', () => {
      // The turn's snapshot is the store's live one AND it is contextFull,
      // so the sticky banner is the single surface — footer drops "cut off"
      // and shows plain "Interrupted" instead.
      const snapshot = {used: 4096, contextFull: true, isRemote: false};
      runInAction(() => {
        chatSessionStore.lastCompletionResult = snapshot;
      });
      const message = baseTurn({
        metadata: {
          copyable: true,
          interrupted: true,
          truncationLikely: true,
          completionResult: snapshot,
        },
      });
      const {getByTestId, getByText, queryByText} = render(
        <AssistantTurnFooter message={message} />,
      );
      expect(getByTestId('footer-interrupted-status')).toBeTruthy();
      expect(getByText('Interrupted')).toBeTruthy();
      expect(queryByText('Cut off — likely context full')).toBeNull();
    });

    it('still shows "cut off" when the turn snapshot is not the live banner snapshot', () => {
      // An older truncated turn whose snapshot is not the store's live one
      // keeps its own "cut off" footer.
      runInAction(() => {
        chatSessionStore.lastCompletionResult = {
          used: 1000,
          contextFull: false,
          isRemote: false,
        };
      });
      const message = baseTurn({
        metadata: {
          copyable: true,
          interrupted: true,
          truncationLikely: true,
          completionResult: {used: 4096, contextFull: true, isRemote: false},
        },
      });
      const {getByText} = render(<AssistantTurnFooter message={message} />);
      expect(getByText('Cut off — likely context full')).toBeTruthy();
    });

    it('shows "cut off" when the live snapshot is not contextFull even if it matches', () => {
      const snapshot = {used: 1000, contextFull: false, isRemote: false};
      runInAction(() => {
        chatSessionStore.lastCompletionResult = snapshot;
      });
      const message = baseTurn({
        metadata: {
          copyable: true,
          interrupted: true,
          truncationLikely: true,
          completionResult: snapshot,
        },
      });
      const {getByText} = render(<AssistantTurnFooter message={message} />);
      expect(getByText('Cut off — likely context full')).toBeTruthy();
    });

    it('shows plain "Interrupted" for an interrupted-but-not-truncated turn regardless of banner state', () => {
      runInAction(() => {
        chatSessionStore.lastCompletionResult = {
          used: 4096,
          contextFull: true,
          isRemote: false,
        };
      });
      const message = baseTurn({
        metadata: {copyable: true, interrupted: true},
      });
      const {getByText, queryByText} = render(
        <AssistantTurnFooter message={message} />,
      );
      expect(getByText('Interrupted')).toBeTruthy();
      expect(queryByText('Cut off — likely context full')).toBeNull();
    });
  });
});
