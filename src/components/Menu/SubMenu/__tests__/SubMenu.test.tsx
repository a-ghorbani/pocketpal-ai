import React from 'react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {render} from '../../../../../jest/test-utils';
import {SubMenu} from '../SubMenu';
import {MenuItem} from '../../MenuItem';

describe('SubMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when visible', () => {
    const {getByText} = render(
      <SubMenu visible={true} onDismiss={() => {}} anchor={{x: 100, y: 100}}>
        <MenuItem label="SubMenu Item" onPress={() => {}} />
      </SubMenu>,
    );

    expect(getByText('SubMenu Item')).toBeTruthy();
  });

  it('does not render when not visible', () => {
    const {queryByText} = render(
      <SubMenu visible={false} onDismiss={() => {}} anchor={{x: 100, y: 100}}>
        <MenuItem label="SubMenu Item" onPress={() => {}} />
      </SubMenu>,
    );

    expect(queryByText('SubMenu Item')).toBeNull();
  });

  it('handles multiple menu items', () => {
    const {getByText} = render(
      <SubMenu visible={true} onDismiss={() => {}} anchor={{x: 100, y: 100}}>
        <MenuItem label="Item 1" onPress={() => {}} />
        <MenuItem label="Item 2" onPress={() => {}} />
        <MenuItem label="Item 3" onPress={() => {}} />
      </SubMenu>,
    );

    expect(getByText('Item 1')).toBeTruthy();
    expect(getByText('Item 2')).toBeTruthy();
    expect(getByText('Item 3')).toBeTruthy();
  });

  it('passes statusBarHeight to PaperMenu', () => {
    const PaperMenu = require('react-native-paper').Menu;
    const {UNSAFE_getByType} = render(
      <SubMenu visible={true} onDismiss={() => {}} anchor={{x: 100, y: 100}}>
        <MenuItem label="Item 1" onPress={() => {}} />
      </SubMenu>,
    );

    const paperMenuInstance = UNSAFE_getByType(PaperMenu);
    expect(paperMenuInstance.props.statusBarHeight).toBeDefined();
    expect(typeof paperMenuInstance.props.statusBarHeight).toBe('number');
  });

  it('uses insets.top from useSafeAreaInsets as statusBarHeight', () => {
    (useSafeAreaInsets as jest.Mock).mockReturnValue({
      top: 47,
      right: 0,
      bottom: 34,
      left: 0,
    });

    const PaperMenu = require('react-native-paper').Menu;
    const {UNSAFE_getByType} = render(
      <SubMenu visible={true} onDismiss={() => {}} anchor={{x: 100, y: 100}}>
        <MenuItem label="Item 1" onPress={() => {}} />
      </SubMenu>,
    );

    const paperMenuInstance = UNSAFE_getByType(PaperMenu);
    expect(paperMenuInstance.props.statusBarHeight).toBe(47);
  });

  it('passes custom style alongside default styles', () => {
    const PaperMenu = require('react-native-paper').Menu;
    const customStyle = {marginTop: 10};
    const {UNSAFE_getByType} = render(
      <SubMenu
        visible={true}
        onDismiss={() => {}}
        anchor={{x: 100, y: 100}}
        style={customStyle}>
        <MenuItem label="Item 1" onPress={() => {}} />
      </SubMenu>,
    );

    const paperMenuInstance = UNSAFE_getByType(PaperMenu);
    const styleArray = paperMenuInstance.props.style;
    expect(styleArray).toEqual(
      expect.arrayContaining([expect.objectContaining(customStyle)]),
    );
  });

  it('forwards additional props to PaperMenu', () => {
    const PaperMenu = require('react-native-paper').Menu;
    const {UNSAFE_getByType} = render(
      <SubMenu
        visible={true}
        onDismiss={() => {}}
        anchor={{x: 200, y: 300}}
        testID="submenu-test">
        <MenuItem label="Item 1" onPress={() => {}} />
      </SubMenu>,
    );

    const paperMenuInstance = UNSAFE_getByType(PaperMenu);
    expect(paperMenuInstance.props.anchor).toEqual({x: 200, y: 300});
    expect(paperMenuInstance.props.testID).toBe('submenu-test');
  });

  it('passes contentStyle to PaperMenu', () => {
    const PaperMenu = require('react-native-paper').Menu;
    const {UNSAFE_getByType} = render(
      <SubMenu visible={true} onDismiss={() => {}} anchor={{x: 100, y: 100}}>
        <MenuItem label="Item 1" onPress={() => {}} />
      </SubMenu>,
    );

    const paperMenuInstance = UNSAFE_getByType(PaperMenu);
    expect(paperMenuInstance.props.contentStyle).toBeDefined();
  });
});
