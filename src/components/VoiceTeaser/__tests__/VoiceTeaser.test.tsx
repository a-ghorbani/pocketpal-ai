import React from 'react';
import {AccessibilityInfo, BackHandler} from 'react-native';

import * as Reanimated from 'react-native-reanimated';
import {State} from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';

import {VoiceTeaser} from '../VoiceTeaser';

const strings = l10n.en.voiceMode;
const onGetPlus = jest.fn();
const onKeepTyping = jest.fn();
const onClose = jest.fn();

const renderTeaser = () =>
  render(
    <VoiceTeaser
      onGetPlus={onGetPlus}
      onKeepTyping={onKeepTyping}
      onClose={onClose}
    />,
  );

describe('VoiceTeaser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the voice view at rest with the Plus copy', () => {
    const withRepeat = jest.spyOn(Reanimated, 'withRepeat');
    const {getByText, getByTestId} = renderTeaser();

    expect(getByText(strings.teaserTitle)).toBeTruthy();
    expect(getByText(strings.teaserBody)).toBeTruthy();
    expect(
      getByTestId('voice-cloud-still', {includeHiddenElements: true}),
    ).toBeTruthy();
    expect(withRepeat).not.toHaveBeenCalled();
    withRepeat.mockRestore();
  });

  it('Get Plus and Keep typing each call their own handler', () => {
    const {getByTestId} = renderTeaser();

    fireEvent.press(getByTestId('voice-teaser-get-plus'));
    expect(onGetPlus).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('voice-teaser-keep-typing'));
    expect(onKeepTyping).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from the close button, Android back and the escape gesture', () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    const {getByTestId} = renderTeaser();

    fireEvent.press(getByTestId('voice-teaser-close'));
    expect(addListener.mock.calls[0][1]({} as any)).toBe(true);
    fireEvent(getByTestId('voice-teaser'), 'accessibilityEscape');

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onKeepTyping).not.toHaveBeenCalled();
    addListener.mockRestore();
  });

  it.each([
    ['closes on a long pull down', 120, 0, 1],
    ['closes on a quick flick down', 30, 1200, 1],
    ['stays on a short, slow pull down', 30, 100, 0],
  ])('%s', async (_name, translationY, velocityY, times) => {
    renderTeaser();

    fireGestureHandler(getByGestureTestId('voice-teaser-pull'), [
      {state: State.BEGAN, translationY: 0, velocityY: 0},
      {state: State.ACTIVE, translationY: translationY / 2, velocityY},
      {state: State.END, translationY, velocityY},
    ]);
    await act(async () => {});

    expect(onClose).toHaveBeenCalledTimes(times);
  });

  it('is a modal that moves screen reader focus to its title', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const {getByTestId, getByText} = renderTeaser();

    expect(getByTestId('voice-teaser').props.accessibilityViewIsModal).toBe(
      true,
    );
    expect(getByText(strings.teaserTitle).props.accessibilityRole).toBe(
      'header',
    );
    await act(
      () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
    );
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });
});
