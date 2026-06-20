import React from 'react';
import {Text} from 'react-native';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {BottomNavBar, pillLeft} from '../BottomNavBar';
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

describe('BottomNavBar floating pill — positioning & sync', () => {
  const layoutItem = (el: any, x: number, width: number) =>
    fireEvent(el, 'layout', {
      nativeEvent: {layout: {x, y: 0, width, height: 40}},
    });

  // A 3-tab bar: container width 306, each item 100 wide with a 3px gap.
  const containerWidth = 306;

  it('uses the physical onLayout x directly in LTR', () => {
    expect(pillLeft(103, 100, containerWidth, false)).toBe(103);
    expect(pillLeft(0, 100, containerWidth, false)).toBe(0);
  });

  it('mirrors the onLayout x against the container width in RTL', () => {
    // In RTL onLayout x is measured from the right; mirror it to a physical
    // left. The centre tab [103,203] mirrors to 306-103-100 = 103.
    expect(pillLeft(103, 100, containerWidth, true)).toBe(103);
    // The logical-first tab (x=0) sits physically at the right edge.
    expect(pillLeft(0, 100, containerWidth, true)).toBe(containerWidth - 100);
    // The logical-last tab (x=206) sits physically at the left (0, not -0).
    expect(pillLeft(206, 100, containerWidth, true)).toBe(0);
  });

  it('seats the sliding pill only after the selected tab measures', () => {
    const {getByTestId, queryByTestId} = render(
      <BottomNavBar
        variant="floating"
        items={items}
        selectedValue="chat"
        onSelect={() => {}}
      />,
    );
    // Pre-layout: no measured frame yet, so the pill is not rendered.
    expect(queryByTestId('ui-bottom-nav-pill')).toBeNull();
    layoutItem(getByTestId('ui-bottom-nav-item-chat'), 0, 100);
    expect(getByTestId('ui-bottom-nav-pill')).toBeTruthy();
  });

  it('keeps the pill seated when selectedValue changes without a tap', () => {
    const {getByTestId, rerender} = render(
      <BottomNavBar
        variant="floating"
        items={items}
        selectedValue="chat"
        onSelect={() => {}}
      />,
    );
    layoutItem(getByTestId('ui-bottom-nav-item-chat'), 0, 100);
    layoutItem(getByTestId('ui-bottom-nav-item-pals'), 104, 100);
    // Programmatic / back / deep-link selection change (no tap).
    rerender(
      <BottomNavBar
        variant="floating"
        items={items}
        selectedValue="pals"
        onSelect={() => {}}
      />,
    );
    expect(getByTestId('ui-bottom-nav-pill')).toBeTruthy();
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
