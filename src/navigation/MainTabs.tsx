import React, {useContext} from 'react';
import {StyleSheet} from 'react-native';

import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import {useKeyboardState} from 'react-native-keyboard-controller';

import {useTheme} from '../hooks';
import {L10nContext} from '../utils';
import {BottomNavBar} from '../components/ui/BottomNavBar';
import {ChatIcon, CompassIcon, SettingsIcon} from '../assets/icons';
import {HomeScreen, ExploreScreen, SettingsScreen} from '../screens';
import type {MainTabParamList} from '../utils/types';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Approximate floating-bar height (icon + label + vertical padding). Used only
// to slide the bar fully off-screen when hidden; over-translating is harmless.
const TAB_BAR_HEIGHT = 72;

// Hide-on-keyboard timing for the floating bar. Honours the OS reduce-motion
// setting (ReduceMotion.System) by snapping when enabled.
const TAB_HIDE_TIMING = {duration: 160, reduceMotion: ReduceMotion.System};

const FloatingTabBar: React.FC<BottomTabBarProps> = ({state, navigation}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardState(s => s.isVisible);

  // The bar fades and slides fully off the bottom edge while the keyboard is
  // open so it cannot intercept taps over the docked composer; it restores on
  // blur. Translate by the bar height + its safe-area padding so it clears the
  // screen regardless of inset.
  const hideOffset = TAB_BAR_HEIGHT + Math.max(insets.bottom, theme.spacing.s);
  const hideProgress = useDerivedValue(() =>
    withTiming(isKeyboardVisible ? 1 : 0, TAB_HIDE_TIMING),
  );
  const hideStyle = useAnimatedStyle(() => ({
    opacity: 1 - hideProgress.value,
    transform: [{translateY: hideProgress.value * hideOffset}],
  }));

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
    <Animated.View
      testID="floating-tab-bar"
      pointerEvents={isKeyboardVisible ? 'none' : 'auto'}
      style={[
        styles.tabBarContainer,
        {paddingBottom: Math.max(insets.bottom, theme.spacing.s)},
        hideStyle,
      ]}>
      <BottomNavBar
        variant="floating"
        items={items}
        selectedValue={focusedValue}
        onSelect={onSelect}
      />
    </Animated.View>
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
