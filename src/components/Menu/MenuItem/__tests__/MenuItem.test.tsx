import React from 'react';
import {MenuItem} from '../MenuItem';
import {useTheme} from '../../../../hooks';
import {fireEvent, render} from '../../../../../jest/test-utils';
import {themeFixtures} from '../../../../../jest/fixtures/theme';

describe('MenuItem', () => {
  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      ...themeFixtures.lightTheme,
      colors: {
        menuText: '#000000',
        menuDangerText: '#FF0000',
        menuBackgroundActive: '#E0E0E0',
      },
      fonts: {
        bodySmall: {},
      },
    });
  });

  it('renders basic menu item correctly', () => {
    const onPress = jest.fn();
    const {getByText} = render(
      <MenuItem label="Test Item" onPress={onPress} />,
    );

    expect(getByText('Test Item')).toBeTruthy();
  });

  it('handles press events', () => {
    const onPress = jest.fn();
    const {getByText} = render(
      <MenuItem label="Test Item" onPress={onPress} />,
    );

    fireEvent.press(getByText('Test Item'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders leading icon when provided', () => {
    const {UNSAFE_getByProps} = render(
      <MenuItem label="Test Item" leadingIcon="check" onPress={() => {}} />,
    );

    expect(UNSAFE_getByProps({source: 'check'})).toBeTruthy();
  });

  it('renders trailing icon when provided', () => {
    const {UNSAFE_getByProps} = render(
      <MenuItem label="Test Item" trailingIcon="close" onPress={() => {}} />,
    );

    expect(UNSAFE_getByProps({source: 'close'})).toBeTruthy();
  });

  it('handles disabled state correctly', () => {
    const onPress = jest.fn();
    const {getByText} = render(
      <MenuItem label="Test Item" onPress={onPress} disabled={true} />,
    );

    fireEvent.press(getByText('Test Item'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
