import React from 'react';
import {StyleSheet} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';

import {MessageMenuButton} from '../MessageMenuButton';

const ICON_SIZE = 16;
const MIN_TARGET = 44;

describe('MessageMenuButton', () => {
  it('is an accessible button with a localized label', () => {
    const {getByTestId} = render(<MessageMenuButton />);
    const button = getByTestId('message-menu-button');

    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(
      l10n.en.components.messageMenuButton.accessibilityLabel,
    );
  });

  it('reaches a 44 dp hit area through hitSlop, not layout', () => {
    const {getByTestId} = render(<MessageMenuButton />);
    const button = getByTestId('message-menu-button');
    const slop = button.props.hitSlop;
    const edges =
      typeof slop === 'number'
        ? {top: slop, bottom: slop, left: slop, right: slop}
        : slop;

    expect(ICON_SIZE + edges.left + edges.right).toBeGreaterThanOrEqual(
      MIN_TARGET,
    );
    expect(ICON_SIZE + edges.top + edges.bottom).toBeGreaterThanOrEqual(
      MIN_TARGET,
    );
    const style = StyleSheet.flatten(button.props.style) ?? {};
    for (const key of ['height', 'minHeight'] as const) {
      expect(Number(style[key] ?? 0)).toBeLessThan(MIN_TARGET);
    }
  });

  it('calls onPress with the press event', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(<MessageMenuButton onPress={onPress} />);
    const event = {nativeEvent: {pageX: 1, pageY: 2}};

    fireEvent.press(getByTestId('message-menu-button'), event);

    expect(onPress).toHaveBeenCalledWith(event);
  });
});
