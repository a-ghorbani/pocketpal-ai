import React from 'react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {render} from '../../../../jest/test-utils';
import {Menu} from '../Menu';

describe('Menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders menu items correctly', () => {
    const {getByText} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined}>
        <Menu.Item label="Item 1" onPress={() => {}} />
        <Menu.Item label="Item 2" onPress={() => {}} />
      </Menu>,
    );

    expect(getByText('Item 1')).toBeTruthy();
    expect(getByText('Item 2')).toBeTruthy();
  });

  it('renders separators correctly', () => {
    const {UNSAFE_getAllByType} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined}>
        <Menu.Item label="Item 1" onPress={() => {}} />
        <Menu.Separator />
        <Menu.Item label="Item 2" onPress={() => {}} />
        <Menu.GroupSeparator />
        <Menu.Item label="Item 3" onPress={() => {}} />
      </Menu>,
    );

    const separators = UNSAFE_getAllByType(Menu.Separator);
    const groupSeparators = UNSAFE_getAllByType(Menu.GroupSeparator);

    expect(separators).toHaveLength(1);
    expect(groupSeparators).toHaveLength(1);
  });

  it('passes statusBarHeight to PaperMenu', () => {
    (useSafeAreaInsets as jest.Mock).mockReturnValue({
      top: 59,
      right: 0,
      bottom: 34,
      left: 0,
    });

    const PaperMenu = require('react-native-paper').Menu;
    const {UNSAFE_getByType} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined}>
        <Menu.Item label="Item 1" onPress={() => {}} />
      </Menu>,
    );

    const paperMenuInstance = UNSAFE_getByType(PaperMenu);
    expect(paperMenuInstance.props.statusBarHeight).toBe(59);
  });

  it('does not render when visible is true but has no children', () => {
    const PaperMenu = require('react-native-paper').Menu;
    const {UNSAFE_getByType} = render(
      <Menu visible={true} onDismiss={() => {}} anchor={undefined} />,
    );

    const paperMenuInstance = UNSAFE_getByType(PaperMenu);
    expect(paperMenuInstance.props.visible).toBe(false);
  });
});
