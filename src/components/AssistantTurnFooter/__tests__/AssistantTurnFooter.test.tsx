import React from 'react';
import {runInAction} from 'mobx';

import {render, fireEvent} from '../../../../jest/test-utils';

import {chatSessionStore} from '../../../store';

import {AssistantTurnFooter} from '../AssistantTurnFooter';

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

describe('AssistantTurnFooter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when neither timings nor copyable are set', () => {
    const message = baseTurn({metadata: {}});
    const {queryByTestId} = render(<AssistantTurnFooter message={message} />);
    expect(queryByTestId('assistant-turn-footer')).toBeNull();
  });

  describe('regenerate / more action affordances', () => {
    it('omits both regenerate and more buttons when no handlers are supplied', () => {
      const message = baseTurn({metadata: {copyable: true}});
      const {queryByTestId} = render(<AssistantTurnFooter message={message} />);
      expect(queryByTestId('assistant-turn-footer')).toBeTruthy();
      expect(queryByTestId('footer-regenerate')).toBeNull();
      expect(queryByTestId('footer-more')).toBeNull();
    });

    it('renders the regenerate button and invokes onRegenerate on press', () => {
      const onRegenerate = jest.fn();
      const message = baseTurn({metadata: {copyable: true}});
      const {getByTestId} = render(
        <AssistantTurnFooter message={message} onRegenerate={onRegenerate} />,
      );
      const button = getByTestId('footer-regenerate');
      expect(button).toBeTruthy();
      fireEvent.press(button);
      expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('renders the more button and invokes onMore with the press event', () => {
      const onMore = jest.fn();
      const message = baseTurn({metadata: {copyable: true}});
      const {getByTestId} = render(
        <AssistantTurnFooter message={message} onMore={onMore} />,
      );
      const button = getByTestId('footer-more');
      expect(button).toBeTruthy();
      const pressEvent = {nativeEvent: {pageX: 42, pageY: 84}};
      fireEvent.press(button, pressEvent);
      expect(onMore).toHaveBeenCalledTimes(1);
      // The handler must receive the press event so the menu can anchor
      // at the tap position (parity with a row long-press).
      expect(onMore.mock.calls[0][0]).toBeDefined();
    });

    it('regenerate/more are independent of copy — both still render the existing copy button', () => {
      const onRegenerate = jest.fn();
      const onMore = jest.fn();
      const message = baseTurn({metadata: {copyable: true}});
      const {getByTestId} = render(
        <AssistantTurnFooter
          message={message}
          onRegenerate={onRegenerate}
          onMore={onMore}
        />,
      );
      expect(getByTestId('footer-copy')).toBeTruthy();
      expect(getByTestId('footer-regenerate')).toBeTruthy();
      expect(getByTestId('footer-more')).toBeTruthy();
    });

    it('renders regenerate/more even on a copy-only (aborted) turn with no timings', () => {
      const onRegenerate = jest.fn();
      const onMore = jest.fn();
      const message = baseTurn({
        metadata: {copyable: true, interrupted: true},
      });
      const {getByTestId, queryByTestId} = render(
        <AssistantTurnFooter
          message={message}
          onRegenerate={onRegenerate}
          onMore={onMore}
        />,
      );
      expect(queryByTestId('footer-timing')).toBeNull();
      expect(getByTestId('footer-regenerate')).toBeTruthy();
      expect(getByTestId('footer-more')).toBeTruthy();
      expect(getByTestId('footer-interrupted-status')).toBeTruthy();
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
