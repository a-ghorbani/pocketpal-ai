import React from 'react';
import {Platform, View} from 'react-native';
import {observer} from 'mobx-react';

import {createStyles} from './styles';
import {HeaderRight} from '../HeaderRight';
import {ChatHeaderTitle} from '../ChatHeaderTitle';
import {
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {getDefaultHeaderHeight} from '@react-navigation/elements';
import {useTheme} from '../../hooks';
import {chatSessionStore} from '../../store';
import {HeaderLeft} from '../HeaderLeft';

export const ChatHeader: React.FC = observer(() => {
  const theme = useTheme();

  const insets = useSafeAreaInsets();
  const layout = useSafeAreaFrame();

  // On models with Dynamic Island the status bar height is smaller than the safe area top inset.
  // https://github.com/react-navigation/react-navigation/blob/e4815c538536ddccf4207b87bf3e2f1603dedd84/packages/elements/src/Header/Header.tsx#L52
  // NOTE: in v7, this is fixed and getDefaultHeaderHeight returns the correct height.

  const hasDynamicIsland = Platform.OS === 'ios' && insets.top > 50;
  const statusBarHeight = hasDynamicIsland ? insets.top - 5 : insets.top;

  const headerHeight = getDefaultHeaderHeight(layout, false, statusBarHeight);

  const styles = createStyles({theme, insets, headerHeight});

  const headerStyle = chatSessionStore?.shouldShowHeaderDivider
    ? styles.headerWithDivider
    : styles.headerWithoutDivider;

  return (
    <View testID="header-view" style={[styles.container, headerStyle]}>
      <HeaderLeft />
      <View style={styles.titleSection}>
        <ChatHeaderTitle />
      </View>
      <HeaderRight />
    </View>
  );
});
