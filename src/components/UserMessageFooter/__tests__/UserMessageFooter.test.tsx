import React from 'react';
import {StyleSheet} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';

import {UserMessageFooter} from '../UserMessageFooter';

describe('UserMessageFooter', () => {
  it('renders only the menu button, at the trailing edge', () => {
    const {getByTestId, queryByTestId} = render(<UserMessageFooter />);
    const footer = getByTestId('user-row-footer');

    expect(getByTestId('message-menu-button')).toBeTruthy();
    expect(queryByTestId('footer-copy')).toBeNull();
    expect(StyleSheet.flatten(footer.props.style).alignSelf).toBe('flex-end');
  });

  it('forwards the press event', () => {
    const onMenuPress = jest.fn();
    const {getByTestId} = render(
      <UserMessageFooter onMenuPress={onMenuPress} />,
    );
    const event = {nativeEvent: {pageX: 5, pageY: 6}};

    fireEvent.press(getByTestId('message-menu-button'), event);

    expect(onMenuPress).toHaveBeenCalledWith(event);
  });
});
