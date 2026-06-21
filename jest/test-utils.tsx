import React from 'react';
import {StyleSheet} from 'react-native';

import {PaperProvider} from 'react-native-paper';
import {render} from '@testing-library/react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

import {themeFixtures} from './fixtures/theme';

import {user as userFixture} from './fixtures';

import {MarkdownProvider} from '../src/components/MarkdownView';
import {UserContext} from '../src/utils';
import type {Theme} from '../src/utils/types';

export type CustomRenderOptions = {
  theme?: Theme;
  user?: any;
  withNavigation?: boolean;
  // Renders inside a real Stack.Screen so screens that call
  // navigation.setOptions (e.g. dynamic headerRight) don't throw.
  withNavigationScreen?: boolean;
  withSafeArea?: boolean;
  withBottomSheetProvider?: boolean;
};

const TestStack = createStackNavigator();

const customRender = (
  ui: React.ReactElement,
  {
    theme = themeFixtures.lightTheme,
    user = userFixture,
    withNavigation = false,
    withNavigationScreen = false,
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

    const withNavigationWrapper =
      withNavigation || withNavigationScreen ? (
        <NavigationContainer>
          {withNavigationScreen ? (
            <TestStack.Navigator>
              <TestStack.Screen
                name="TestScreen"
                options={{headerShown: false}}>
                {() => withBottomSheetProviderWrapper}
              </TestStack.Screen>
            </TestStack.Navigator>
          ) : (
            withBottomSheetProviderWrapper
          )}
        </NavigationContainer>
      ) : (
        withBottomSheetProviderWrapper
      );

    // Sits inside PaperProvider so the MarkdownProvider can read theme,
    // and provides the ambient TRenderEngineProvider/RenderHTMLConfigProvider
    // any component using RenderHTMLSource (e.g. MarkdownView) depends on.
    const withPaperProvider = (
      <PaperProvider theme={theme}>
        <MarkdownProvider>{withNavigationWrapper}</MarkdownProvider>
      </PaperProvider>
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
