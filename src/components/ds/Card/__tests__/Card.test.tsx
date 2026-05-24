import React from 'react';
import {Text} from 'react-native';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {Card} from '../Card';
import {CardList} from '../CardList';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Card', () => {
  it('defaults to testID=ds-card and role=none', () => {
    const {getByTestId} = render(
      <Card>
        <Text>body</Text>
      </Card>,
    );
    const el = getByTestId('ds-card');
    expect(el.props.accessibilityRole).toBe('none');
  });

  it('wraps in Pressable when onPress is provided', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(
      <Card onPress={onPress}>
        <Text>body</Text>
      </Card>,
    );
    fireEvent.press(getByTestId('ds-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('CardList', () => {
  it('defaults to testID=ds-card-list', () => {
    const {getByTestId} = render(
      <CardList>
        <Text>body</Text>
      </CardList>,
    );
    expect(getByTestId('ds-card-list')).toBeTruthy();
  });
});

runSnapshotMatrix(
  'Card',
  ({variant, size}) => (
    <Card variant={variant} size={size}>
      <Text>card body</Text>
    </Card>
  ),
  {
    variants: ['flat', 'elevated', 'outlined'] as const,
    sizes: ['s', 'm', 'l'] as const,
    langs: ['fa'] as const,
  },
);
