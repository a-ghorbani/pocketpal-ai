import React, {useContext} from 'react';
import {View, StyleSheet} from 'react-native';

import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../hooks';
import {L10nContext} from '../utils';
import {BottomNavBar} from '../components/ui/BottomNavBar';
import {ChatIcon, CompassIcon, SettingsIcon} from '../assets/icons';
import {HomeScreen, ExploreScreen, SettingsScreen} from '../screens';
import type {MainTabParamList} from '../utils/types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const FloatingTabBar: React.FC<BottomTabBarProps> = ({state, navigation}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const insets = useSafeAreaInsets();

  const items = [
    {
      value: 'ChatsTab',
      label: l10n.tabs.chats,
      icon: <ChatIcon stroke={theme.colors.onSurface} />,
    },
    {
      value: 'ExploreTab',
      label: l10n.tabs.explore,
      icon: <CompassIcon stroke={theme.colors.onSurface} />,
    },
    {
      value: 'SettingsTab',
      label: l10n.tabs.settings,
      icon: <SettingsIcon stroke={theme.colors.onSurface} />,
    },
  ];

  const focusedValue = state.routes[state.index].name;

  const onSelect = (value: string) => {
    const route = state.routes.find(r => r.name === value);
    const isFocused = state.routes[state.index].name === value;
    const event = navigation.emit({
      type: 'tabPress',
      target: route?.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(value);
    }
  };

  return (
    <View
      style={[
        styles.tabBarContainer,
        {paddingBottom: Math.max(insets.bottom, theme.spacing.s)},
      ]}>
      <BottomNavBar
        variant="floating"
        items={items}
        selectedValue={focusedValue}
        onSelect={onSelect}
      />
    </View>
  );
};

export const MainTabs: React.FC = () => (
  <Tab.Navigator
    initialRouteName="ChatsTab"
    screenOptions={{headerShown: false}}
    tabBar={props => <FloatingTabBar {...props} />}>
    <Tab.Screen name="ChatsTab" component={HomeScreen} />
    <Tab.Screen name="ExploreTab" component={ExploreScreen} />
    <Tab.Screen name="SettingsTab" component={SettingsScreen} />
  </Tab.Navigator>
);

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
});
