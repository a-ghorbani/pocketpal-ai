import React from 'react';
import {Text} from 'react-native';

import {NavigationContainer} from '@react-navigation/native';
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import {fireEvent, render} from '@testing-library/react-native';

import {SidebarContent} from '../SidebarContent';
import {plusGate} from '../../../services/plus/gate';
import * as gate from '../../../services/plus/gate';
import {setShipOverride} from '../../../services/plus/shipOverride';

const Screen = () => <Text>Screen</Text>;
const Drawer = createDrawerNavigator();

let drawerProps: DrawerContentComponentProps | undefined;

const renderSidebarContent = (props: DrawerContentComponentProps) => {
  drawerProps = props;
  return <SidebarContent {...props} />;
};

const TestNavigator = () => (
  <NavigationContainer>
    <Drawer.Navigator drawerContent={renderSidebarContent}>
      <Drawer.Screen name="Chat" component={Screen} />
    </Drawer.Navigator>
  </NavigationContainer>
);

describe('SidebarContent Plus entry', () => {
  afterEach(() => {
    setShipOverride([]);
    jest.restoreAllMocks();
  });

  it('has no Plus entry while no Plus feature has shipped', () => {
    const {queryByTestId, getByTestId, getByText} = render(<TestNavigator />);

    expect(getByTestId('drawer-item-settings')).toBeTruthy();
    expect(getByText('App Info')).toBeTruthy();
    expect(queryByTestId('drawer-item-plus')).toBeNull();
  });

  it('sits between Settings and App Info once a feature ships', () => {
    setShipOverride(['handsFreeVoice']);
    const {getAllByText} = render(<TestNavigator />);

    expect(
      getAllByText(/^(Settings|PocketPal Plus|App Info)$/).map(
        node => node.props.children,
      ),
    ).toEqual(['Settings', 'PocketPal Plus', 'App Info']);
  });

  it('closes the drawer, then opens Plus with no callback', () => {
    setShipOverride(['handsFreeVoice']);
    const calls: string[] = [];
    const {getByTestId} = render(<TestNavigator />);
    jest
      .spyOn(drawerProps!.navigation, 'closeDrawer')
      .mockImplementation(() => calls.push('closeDrawer'));
    const open = jest.spyOn(gate, 'openPlus');

    fireEvent.press(getByTestId('drawer-item-plus'));

    expect(calls).toEqual(['closeDrawer']);
    expect(plusGate.request).toEqual({onUnlocked: undefined});
    expect(open).toHaveBeenCalledWith();
  });
});
