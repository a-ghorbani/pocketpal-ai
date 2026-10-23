import React from 'react';
import {Text} from 'react-native';

import {NavigationContainer} from '@react-navigation/native';
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import {act, cleanup, fireEvent, render} from '@testing-library/react-native';
import {runInAction} from 'mobx';

import {SidebarContent} from '../SidebarContent';
import {createStyles} from '../styles';
import {purchaseStore} from '../../../store';
import {plusGate} from '../../../services/plus/gate';
import * as gate from '../../../services/plus/gate';
import {setShipOverride} from '../../../services/plus/shipOverride';

jest.mock('../../../services/plus/catalog', () =>
  require('../../../../jest/fixtures/plus').mockUnshippedCatalog(),
);

jest.mock('../styles', () => {
  const actual = jest.requireActual('../styles');
  return {...actual, createStyles: jest.fn(actual.createStyles)};
});

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
    cleanup();
    setShipOverride([]);
    runInAction(() => {
      purchaseStore.plusUnlocked = false;
    });
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

  it('shows the owned look without re-rendering the session list', () => {
    setShipOverride(['handsFreeVoice']);
    const {getByTestId} = render(<TestNavigator />);
    const sidebarRenders = (createStyles as jest.Mock).mock.calls.length;

    act(() => {
      runInAction(() => {
        purchaseStore.plusUnlocked = true;
      });
    });

    expect(getByTestId('drawer-item-plus-subtitle')).toHaveTextContent(
      'Unlocked',
    );
    expect((createStyles as jest.Mock).mock.calls.length).toBe(sidebarRenders);
  });
});
