import React from 'react';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {Tabs} from '../Tabs';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

const items = [
  {value: 'a', label: 'Alpha'},
  {value: 'b', label: 'Beta'},
  {value: 'c', label: 'Gamma'},
];

describe('Tabs', () => {
  it('defaults to testID=ui-tabs and role=tablist', () => {
    const {getByTestId} = render(
      <Tabs items={items} selectedValue="a" onChange={() => {}} />,
    );
    expect(getByTestId('ui-tabs').props.accessibilityRole).toBe('tablist');
  });

  it('templates testID per item and marks selected', () => {
    const {getByTestId} = render(
      <Tabs items={items} selectedValue="b" onChange={() => {}} />,
    );
    expect(
      getByTestId('ui-tab-item-b').props.accessibilityState?.selected,
    ).toBe(true);
    expect(
      getByTestId('ui-tab-item-a').props.accessibilityState?.selected,
    ).toBe(false);
  });

  it('fires onChange with item value on press', () => {
    const onChange = jest.fn();
    const {getByTestId} = render(
      <Tabs items={items} selectedValue="a" onChange={onChange} />,
    );
    fireEvent.press(getByTestId('ui-tab-item-c'));
    expect(onChange).toHaveBeenCalledWith('c');
  });
});

runSnapshotMatrix(
  'Tabs',
  ({variant, size}) => (
    <Tabs
      variant={variant}
      size={size}
      items={items}
      selectedValue="a"
      onChange={() => {}}
    />
  ),
  {
    variants: ['underline', 'pill'] as const,
    sizes: ['s', 'm'] as const,
    langs: ['fa'] as const,
  },
);
