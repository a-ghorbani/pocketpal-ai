import React from 'react';
import {type HostInstance, View} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';

import {HeaderLeft} from '../HeaderLeft';
import {
  claimPlusReturnFocus,
  plusReturnFocusTarget,
  releasePlusReturnFocus,
} from '../plusReturnFocus';

const mockOpenDrawer = jest.fn();
let mockFocusEffect: (() => (() => void) | void) | undefined;

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({openDrawer: mockOpenDrawer}),
  useFocusEffect: (effect: () => (() => void) | void) => {
    mockFocusEffect = effect;
  },
}));

const focus = () => mockFocusEffect!() as () => void;

describe('HeaderLeft', () => {
  afterEach(() => {
    releasePlusReturnFocus(plusReturnFocusTarget());
    mockFocusEffect = undefined;
  });

  it('opens the drawer', () => {
    const {getByTestId} = render(<HeaderLeft />);

    fireEvent.press(getByTestId('menu-button'));

    expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it('holds the Plus return-focus slot while its screen is focused', () => {
    render(<HeaderLeft />);
    expect(plusReturnFocusTarget()).toBeNull();

    const blur = focus();
    const held = plusReturnFocusTarget();
    expect((held as any)?.props?.testID).toBe('menu-button');

    blur();
    expect(plusReturnFocusTarget()).toBeNull();
  });

  it('keeps a newer claim when an older screen blurs', () => {
    render(<HeaderLeft />);
    const other = React.createRef<HostInstance>();
    render(<View ref={other} />);
    const blur = focus();

    claimPlusReturnFocus(other.current);
    blur();

    expect(plusReturnFocusTarget() === other.current).toBe(true);
  });
});
