import React from 'react';
import {Text} from 'react-native';
import {render, fireEvent} from '../../../../jest/test-utils';
import {ThinkingBubble} from '../ThinkingBubble';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {LayoutAnimation} from 'react-native';
import {Animated} from 'react-native';

describe('ThinkingBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(jest.fn());
    jest.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    }));

    jest.spyOn(Animated, 'spring').mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderThinkingBubble = (children = 'Test thinking content') => {
    return render(
      <L10nContext.Provider value={l10n.en}>
        <ThinkingBubble>
          <Text testID="thinking-content">{children}</Text>
        </ThinkingBubble>
      </L10nContext.Provider>,
      {withSafeArea: true},
    );
  };

  it('renders correctly in initial PARTIAL state', () => {
    const {getByText, getByTestId} = renderThinkingBubble();

    // Check if the header text is rendered
    expect(getByText(l10n.en.components.thinkingBubble.reasoning)).toBeTruthy();

    expect(getByTestId('thinking-content')).toBeTruthy();

    // Check if the chevron icon is rendered
    expect(getByTestId('chevron-icon')).toBeTruthy();
  });

  it('transitions from PARTIAL to EXPANDED state when pressed', () => {
    const {getByText} = renderThinkingBubble();

    // Get the header text element which is part of the touchable component
    const headerText = getByText(l10n.en.components.thinkingBubble.reasoning);

    // Press the component to toggle state from PARTIAL to EXPANDED
    fireEvent.press(headerText);

    // In EXPANDED state, the content should still be visible
    // We can't directly test the state, but we can check if LayoutAnimation was called
    expect(LayoutAnimation.configureNext).toHaveBeenCalled();
  });

  it('transitions through all states when pressed multiple times', () => {
    const {getByText, queryByTestId} = renderThinkingBubble();

    // The reasoning label is rendered in PARTIAL/EXPANDED inside
    // headerContainer and in COLLAPSED inside collapsedRow — different
    // elements, same text. Re-query after each press so the press
    // event lands on the live element.
    const press = () =>
      fireEvent.press(getByText(l10n.en.components.thinkingBubble.reasoning));

    // Initial: PARTIAL — no collapsed row
    expect(queryByTestId('thinking-bubble-collapsed')).toBeNull();

    // Press 1: PARTIAL → EXPANDED (still card, no collapsed row)
    press();
    expect(queryByTestId('thinking-bubble-collapsed')).toBeNull();
    expect(
      require('react-native').LayoutAnimation.configureNext,
    ).toHaveBeenCalledTimes(1);

    // Press 2: EXPANDED → COLLAPSED (text-only row appears)
    press();
    expect(queryByTestId('thinking-bubble-collapsed')).not.toBeNull();
    expect(
      require('react-native').LayoutAnimation.configureNext,
    ).toHaveBeenCalledTimes(2);

    // Press 3: COLLAPSED → PARTIAL (back to card)
    press();
    expect(queryByTestId('thinking-bubble-collapsed')).toBeNull();
    expect(
      require('react-native').LayoutAnimation.configureNext,
    ).toHaveBeenCalledTimes(3);
  });

  it('animates the chevron when state changes', () => {
    const {getByText} = renderThinkingBubble();

    const headerText = getByText(l10n.en.components.thinkingBubble.reasoning);

    // Press to change state
    fireEvent.press(headerText);

    // Check if Animated.timing or Animated.spring was called for chevron animation
    const animatedTiming = require('react-native').Animated.timing;
    const animatedSpring = require('react-native').Animated.spring;
    expect(
      animatedTiming.mock.calls.length > 0 ||
        animatedSpring.mock.calls.length > 0,
    ).toBeTruthy();
  });

  it('auto-scrolls to the bottom when content changes', () => {
    const {rerender, getByTestId} = renderThinkingBubble('Initial content');

    // Advance timers to trigger the auto-scroll setTimeout
    jest.advanceTimersByTime(200);

    // Update the content
    rerender(
      <L10nContext.Provider value={l10n.en}>
        <ThinkingBubble>
          <Text testID="thinking-content">Updated content</Text>
        </ThinkingBubble>
      </L10nContext.Provider>,
    );

    // Advance timers again to trigger the auto-scroll for updated content
    jest.advanceTimersByTime(200);

    // Check if the content was updated
    expect(getByTestId('thinking-content').props.children).toBe(
      'Updated content',
    );
  });

  it('renders MaskedView in PARTIAL state when not animating', () => {
    const {getByTestId} = renderThinkingBubble();

    // In PARTIAL state and not animating, it should use MaskedView
    expect(getByTestId('masked-view')).toBeTruthy();
  });

  it('auto-collapses to the compact reasoning row when autoCollapse rises', () => {
    const {queryByTestId, rerender} = render(
      <L10nContext.Provider value={l10n.en}>
        <ThinkingBubble autoCollapse={false}>
          <Text testID="thinking-content">streaming…</Text>
        </ThinkingBubble>
      </L10nContext.Provider>,
      {withSafeArea: true},
    );
    // Streams expanded (PARTIAL): no compact collapsed row yet.
    expect(queryByTestId('thinking-bubble-collapsed')).toBeNull();

    // autoCollapse rises (content begins / step finalizes) → collapse.
    rerender(
      <L10nContext.Provider value={l10n.en}>
        <ThinkingBubble autoCollapse={true}>
          <Text testID="thinking-content">streaming…</Text>
        </ThinkingBubble>
      </L10nContext.Provider>,
    );
    expect(queryByTestId('thinking-bubble-collapsed')).not.toBeNull();
  });

  it('compact collapsed reasoning row shows only the label + chevron, no metric suffix', () => {
    const {getByTestId, getByText} = render(
      <L10nContext.Provider value={l10n.en}>
        <ThinkingBubble autoCollapse={true}>
          <Text testID="thinking-content">done</Text>
        </ThinkingBubble>
      </L10nContext.Provider>,
      {withSafeArea: true},
    );
    const collapsedRow = getByTestId('thinking-bubble-collapsed');
    expect(collapsedRow).toBeTruthy();
    expect(getByText(l10n.en.components.thinkingBubble.reasoning)).toBeTruthy();
    // No per-reasoning token/duration suffix exists (no backing data) —
    // the row must not render any "tokens" / "ms" / "·" metric text.
    const suffixNodes = collapsedRow.findAll(
      (n: any) =>
        n.props &&
        typeof n.props.children === 'string' &&
        /tokens|·|\bms\b|\bs\b\s*$/i.test(n.props.children),
    );
    expect(suffixNodes).toHaveLength(0);
  });

  it('user manual toggle wins: once toggled, a later autoCollapse rise is a no-op', () => {
    // Start expanded, user taps to collapse (takes control), then
    // autoCollapse rises — the bubble must NOT be forced back to collapsed
    // on the user's behalf; their last manual state stands.
    const {getByText, queryByTestId, rerender} = render(
      <L10nContext.Provider value={l10n.en}>
        <ThinkingBubble autoCollapse={false}>
          <Text testID="thinking-content">reasoning…</Text>
        </ThinkingBubble>
      </L10nContext.Provider>,
      {withSafeArea: true},
    );
    // PARTIAL → press → EXPANDED → press → COLLAPSED → press → PARTIAL.
    const press = () =>
      fireEvent.press(getByText(l10n.en.components.thinkingBubble.reasoning));
    press(); // EXPANDED
    press(); // COLLAPSED
    press(); // PARTIAL — user has now taken control, bubble is open
    expect(queryByTestId('thinking-bubble-collapsed')).toBeNull();

    // autoCollapse rises after the user took control → ignored.
    rerender(
      <L10nContext.Provider value={l10n.en}>
        <ThinkingBubble autoCollapse={true}>
          <Text testID="thinking-content">reasoning…</Text>
        </ThinkingBubble>
      </L10nContext.Provider>,
    );
    expect(queryByTestId('thinking-bubble-collapsed')).toBeNull();
  });

  it('handles long content properly', () => {
    const longContent =
      'This is a very long content that should trigger scrolling behavior. '.repeat(
        20,
      );
    const {getByTestId} = renderThinkingBubble(longContent);

    // Check if the content is rendered
    expect(getByTestId('thinking-content')).toBeTruthy();
    expect(getByTestId('thinking-content').props.children).toBe(longContent);

    // Advance timers to trigger the auto-scroll
    jest.advanceTimersByTime(200);
  });
});
