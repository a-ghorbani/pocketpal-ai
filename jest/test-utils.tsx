import React from 'react';
import {StyleSheet} from 'react-native';

import {PaperProvider} from 'react-native-paper';
import {render} from '@testing-library/react-native';
import {NavigationContainer} from '@react-navigation/native';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

import {themeFixtures} from './fixtures/theme';

import {user as userFixture} from './fixtures';

import {UserContext} from '../src/utils';
import type {Theme} from '../src/utils/types';

export type CustomRenderOptions = {
  theme?: Theme;
  user?: any;
  withNavigation?: boolean;
  withSafeArea?: boolean;
  withBottomSheetProvider?: boolean;
};

const customRender = (
  ui: React.ReactElement,
  {
    theme = themeFixtures.lightTheme,
    user = userFixture,
    withNavigation = false,
    withSafeArea = false,
    withBottomSheetProvider = false,
    ...renderOptions
  }: CustomRenderOptions = {},
) => {
  const Wrapper = ({children}: {children: React.ReactNode}) => {
    const withBottomSheetProviderWrapper = withBottomSheetProvider ? (
      <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
    ) : (
      children
    );

    const withNavigationWrapper = withNavigation ? (
      <NavigationContainer>
        {withBottomSheetProviderWrapper}
      </NavigationContainer>
    ) : (
      withBottomSheetProviderWrapper
    );

    const withPaperProvider = (
      <PaperProvider theme={theme}>{withNavigationWrapper}</PaperProvider>
    );

    const withSafeAreaWrapper = withSafeArea ? (
      <SafeAreaProvider
        initialMetrics={{
          frame: {x: 0, y: 0, width: 0, height: 0},
          insets: {top: 0, right: 0, bottom: 0, left: 0},
        }}>
        {withPaperProvider}
      </SafeAreaProvider>
    ) : (
      withPaperProvider
    );

    return (
      <GestureHandlerRootView style={styles.root}>
        <UserContext.Provider value={user}>
          {withSafeAreaWrapper}
        </UserContext.Provider>
      </GestureHandlerRootView>
    );
  };

  return render(ui, {wrapper: Wrapper, ...renderOptions});
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

// Re-export everything
export * from '@testing-library/react-native';
export {customRender as render};
