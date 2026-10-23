import React from 'react';
import {Text} from 'react-native';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../../jest/test-utils';
import {themeFixtures} from '../../../../../../jest/fixtures/theme';

import {Pressable} from '../Pressable';
import {createStateLayerStyle} from '../styles';

describe('Pressable primitive', () => {
  it('renders children', () => {
    const {getByText} = render(
      <Pressable>
        <Text>Hello</Text>
      </Pressable>,
    );
    expect(getByText('Hello')).toBeTruthy();
  });

  it('forwards testID, accessibilityLabel, accessibilityRole', () => {
    const {getByTestId} = render(
      <Pressable
        testID="my-pressable"
        accessibilityLabel="Press me"
        accessibilityRole="button">
        <Text>x</Text>
      </Pressable>,
    );
    const el = getByTestId('my-pressable');
    expect(el.props.accessibilityLabel).toBe('Press me');
    expect(el.props.accessibilityRole).toBe('button');
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(
      <Pressable testID="p" onPress={onPress}>
        <Text>x</Text>
      </Pressable>,
    );
    fireEvent.press(getByTestId('p'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks onPress when disabled and reflects accessibilityState.disabled', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(
      <Pressable testID="p" disabled onPress={onPress}>
        <Text>x</Text>
      </Pressable>,
    );
    const el = getByTestId('p');
    fireEvent.press(el);
    expect(onPress).not.toHaveBeenCalled();
    expect(el.props.accessibilityState?.disabled).toBe(true);
  });

  it('does not render a state-layer overlay in default state', () => {
    const {queryByTestId} = render(
      <Pressable testID="p">
        <Text>x</Text>
      </Pressable>,
    );
    expect(queryByTestId('ui-pressable-state-layer')).toBeNull();
  });

  it('fills the pressable with the pressed state layer', () => {
    const style = createStateLayerStyle(themeFixtures.lightTheme, {
      state: {pressed: true},
      stateLayerColor: '#000',
    });
    expect(style).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
  });
});
