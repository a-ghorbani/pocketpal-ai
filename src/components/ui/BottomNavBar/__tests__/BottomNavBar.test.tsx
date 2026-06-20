import React from 'react';
import {Text} from 'react-native';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {BottomNavBar, pillTranslateX} from '../BottomNavBar';
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

  it('floating variant marks the selected item without a per-item pill fill', () => {
    const {getByTestId} = render(
      <BottomNavBar
        items={items}
        selectedValue="pals"
        onSelect={() => {}}
        variant="floating"
      />,
    );
    const selected = getByTestId('ui-bottom-nav-item-pals');
    const flatten = (s: unknown) =>
      Array.isArray(s) ? Object.assign({}, ...s) : s;
    // The active pill is now a single sliding element, not an item background.
    expect(flatten(selected.props.style).backgroundColor).toBeUndefined();
    expect(selected.props.accessibilityState?.selected).toBe(true);
  });
});

describe('BottomNavBar floating pill — RTL positioning', () => {
  // A 3-tab bar: container width 306, each item 100 wide with a 3px gap.
  const containerWidth = 306;
  const middle = {x: 103, width: 100}; // the centre tab

  it('positions the pill at the physical-left frame.x in LTR', () => {
    expect(pillTranslateX(middle.x, middle.width, containerWidth, false)).toBe(
      103,
    );
  });

  it('mirrors frame.x off the start (right) edge in RTL', () => {
    // Mirror of [103, 203] within 306 is [103, 203] from the right → -103.
    expect(pillTranslateX(middle.x, middle.width, containerWidth, true)).toBe(
      -(containerWidth - middle.x - middle.width),
    );
    expect(pillTranslateX(middle.x, middle.width, containerWidth, true)).toBe(
      -103,
    );
  });

  it('keeps the first and last tabs symmetric across LTR/RTL', () => {
    const first = {x: 0, width: 100};
    const last = {x: 206, width: 100};
    // First tab in LTR sits at the start (0); the same tab in RTL sits at the
    // start (right) edge → also 0 translate.
    expect(pillTranslateX(first.x, first.width, containerWidth, false)).toBe(0);
    expect(pillTranslateX(last.x, last.width, containerWidth, true)).toBe(0);
  });
});

runSnapshotMatrix(
  'BottomNavBar',
  ({variant}) => (
    <BottomNavBar
      items={items}
      selectedValue="chat"
      onSelect={() => {}}
      variant={variant}
    />
  ),
  {
    variants: ['default', 'floating'] as const,
    sizes: ['m'] as const,
    langs: ['fa'] as const,
  },
);
