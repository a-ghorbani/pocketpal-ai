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
    const {getByText} = renderThinkingBubble();

    const headerText = getByText(l10n.en.components.thinkingBubble.reasoning);

    // First press: PARTIAL to EXPANDED
    fireEvent.press(headerText);
    expect(
      require('react-native').LayoutAnimation.configureNext,
    ).toHaveBeenCalledTimes(1);

    // Second press: EXPANDED to COLLAPSED
    fireEvent.press(headerText);
    expect(
      require('react-native').LayoutAnimation.configureNext,
    ).toHaveBeenCalledTimes(2);

    // Third press: COLLAPSED to PARTIAL
    fireEvent.press(headerText);
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
