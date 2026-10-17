import React from 'react';
import {StyleSheet} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';

import {MessageMenuButton} from '../MessageMenuButton';

const MIN_TARGET = 44;
const FOOTPRINT_WIDTH = 25;
const FOOTPRINT_HEIGHT = 16;

describe('MessageMenuButton', () => {
  it('is an accessible button with a localized label', () => {
    const {getByTestId} = render(<MessageMenuButton />);
    const button = getByTestId('message-menu-button');

    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(
      l10n.en.components.messageMenuButton.accessibilityLabel,
    );
  });

  it('is a 44 dp layout box that keeps the 25 x 16 dp footprint', () => {
    const {getByTestId} = render(<MessageMenuButton />);
    const button = getByTestId('message-menu-button');
    const style = StyleSheet.flatten(button.props.style) ?? {};

    expect(style.minWidth).toBe(MIN_TARGET);
    expect(style.minHeight).toBe(MIN_TARGET);
    expect(style.flexShrink).toBe(0);
    expect(
      MIN_TARGET + Number(style.marginLeft) + Number(style.marginRight),
    ).toBe(FOOTPRINT_WIDTH);
    expect(
      MIN_TARGET + Number(style.marginTop) + Number(style.marginBottom),
    ).toBe(FOOTPRINT_HEIGHT);
    expect(style).toMatchObject({
      marginLeft: -5,
      marginTop: -14,
      marginRight: -14,
      marginBottom: -14,
    });
    expect(button.props.hitSlop).toBeUndefined();
  });

  it('calls onPress with the press event', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(<MessageMenuButton onPress={onPress} />);
    const event = {nativeEvent: {pageX: 1, pageY: 2}};

    fireEvent.press(getByTestId('message-menu-button'), event);

    expect(onPress).toHaveBeenCalledWith(event);
  });
});
