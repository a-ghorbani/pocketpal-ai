import React from 'react';
import {Text} from 'react-native';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {IconButton} from '../IconButton';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

const Icon = () => <Text>★</Text>;

describe('IconButton', () => {
  it('defaults to testID=ui-icon-button and role=button', () => {
    const {getByTestId} = render(
      <IconButton icon={<Icon />} accessibilityLabel="Star" />,
    );
    const el = getByTestId('ui-icon-button');
    expect(el.props.accessibilityRole).toBe('button');
  });

  it('forwards accessibilityLabel and renders icon', () => {
    const {getByTestId, getByText} = render(
      <IconButton icon={<Icon />} accessibilityLabel="Star" />,
    );
    expect(getByTestId('ui-icon-button').props.accessibilityLabel).toBe('Star');
    expect(getByText('★')).toBeTruthy();
  });

  it('calls onPress', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(
      <IconButton
        icon={<Icon />}
        accessibilityLabel="Star"
        onPress={onPress}
      />,
    );
    fireEvent.press(getByTestId('ui-icon-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

runSnapshotMatrix(
  'IconButton',
  ({variant, size, state}) => (
    <IconButton
      variant={variant}
      size={size}
      icon={<Icon />}
      accessibilityLabel="Star"
      disabled={state === 'disabled'}
    />
  ),
  {
    variants: ['standard', 'filled', 'outlined'] as const,
    sizes: ['s', 'm', 'l'] as const,
    langs: ['fa'] as const,
  },
);
