import React from 'react';
import {Text} from 'react-native';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {BottomNavBar} from '../BottomNavBar';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

const items = [
  {value: 'chat', label: 'Chat', icon: <Text>C</Text>},
  {value: 'pals', label: 'Pals', icon: <Text>P</Text>},
  {value: 'models', label: 'Models', icon: <Text>M</Text>},
];

describe('BottomNavBar', () => {
  it('defaults to testID=ui-bottom-nav and role=tablist', () => {
    const {getByTestId} = render(
      <BottomNavBar items={items} selectedValue="chat" onSelect={() => {}} />,
    );
    expect(getByTestId('ui-bottom-nav').props.accessibilityRole).toBe(
      'tablist',
    );
  });

  it('templates testID per item and marks selected', () => {
    const {getByTestId} = render(
      <BottomNavBar items={items} selectedValue="pals" onSelect={() => {}} />,
    );
    expect(
      getByTestId('ui-bottom-nav-item-pals').props.accessibilityState?.selected,
    ).toBe(true);
  });

  it('fires onSelect on press', () => {
    const onSelect = jest.fn();
    const {getByTestId} = render(
      <BottomNavBar items={items} selectedValue="chat" onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('ui-bottom-nav-item-models'));
    expect(onSelect).toHaveBeenCalledWith('models');
  });
});

runSnapshotMatrix(
  'BottomNavBar',
  ({variant: _v, size: _s}) => (
    <BottomNavBar items={items} selectedValue="chat" onSelect={() => {}} />
  ),
  {
    variants: ['default'] as const,
    sizes: ['m'] as const,
    langs: ['fa'] as const,
  },
);
