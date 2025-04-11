import * as React from 'react';
import {Dimensions, StyleSheet} from 'react-native';

import {observer} from 'mobx-react';
import {NavigationContainer} from '@react-navigation/native';
import {Provider as PaperProvider} from 'react-native-paper';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {createDrawerNavigator} from '@react-navigation/drawer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {
  gestureHandlerRootHOC,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';

import {uiStore} from './src/store';
import {useTheme} from './src/hooks';
import {Theme} from './src/utils/types';

import {l10n} from './src/utils/l10n';
import {initLocale} from './src/utils';
import {L10nContext} from './src/utils';

import {SidebarContent, ModelsHeaderRight, HeaderLeft} from './src/components';
import {
  ChatScreen,
  ModelsScreen,
  SettingsScreen,
  BenchmarkScreen,
  TestCompletionScreen,
  AboutScreen,
  PalsScreen,
} from './src/screens';

// Check if app is in debug mode
const isDebugMode = __DEV__;

const Drawer = createDrawerNavigator();

const screenWidth = Dimensions.get('window').width;

const App = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);

  // Initialize locale with the current language
  React.useEffect(() => {
    initLocale(uiStore.language);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
          <PaperProvider theme={theme}>
            <L10nContext.Provider value={l10n[uiStore.language]}>
              <NavigationContainer>
                <BottomSheetModalProvider>
                  <Drawer.Navigator
                    useLegacyImplementation={false}
                    screenOptions={{
                      headerLeft: () => <HeaderLeft />,
                      drawerStyle: {
                        width: screenWidth > 400 ? 320 : screenWidth * 0.8,
                      },
                      headerStyle: {
                        backgroundColor: theme.colors.background,
                      },
                      headerTintColor: theme.colors.onBackground,
                      headerTitleStyle: styles.headerTitle,
                    }}
                    drawerContent={props => <SidebarContent {...props} />}>
                    <Drawer.Screen
                      name="Chat"
                      component={gestureHandlerRootHOC(ChatScreen)}
                      options={{
                        headerShown: false,
                      }}
                    />
                    <Drawer.Screen
                      name="Models"
                      component={gestureHandlerRootHOC(ModelsScreen)}
                      options={{
                        headerRight: () => <ModelsHeaderRight />,
                        headerStyle: styles.headerWithoutDivider,
                      }}
                    />
                    <Drawer.Screen
                      name="Pals (experimental)"
                      component={gestureHandlerRootHOC(PalsScreen)}
                      options={{
                        headerStyle: styles.headerWithoutDivider,
                      }}
                    />
                    <Drawer.Screen
                      name="Benchmark"
                      component={gestureHandlerRootHOC(BenchmarkScreen)}
                      options={{
                        headerStyle: styles.headerWithoutDivider,
                      }}
                    />
                    <Drawer.Screen
                      name="Settings"
                      component={gestureHandlerRootHOC(SettingsScreen)}
                      options={{
                        headerStyle: styles.headerWithoutDivider,
                      }}
                    />
                    <Drawer.Screen
                      name="App Info"
                      component={gestureHandlerRootHOC(AboutScreen)}
                      options={{
                        headerStyle: styles.headerWithoutDivider,
                      }}
                    />

                    {/* Only show Test Completion screen in debug mode */}
                    {isDebugMode && (
                      <Drawer.Screen
                        name="Test Completion"
                        component={gestureHandlerRootHOC(TestCompletionScreen)}
                        options={{
                          headerStyle: styles.headerWithoutDivider,
                        }}
                      />
                    )}
                  </Drawer.Navigator>
                </BottomSheetModalProvider>
              </NavigationContainer>
            </L10nContext.Provider>
          </PaperProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    headerWithoutDivider: {
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      backgroundColor: theme.colors.background,
    },
    headerWithDivider: {
      backgroundColor: theme.colors.background,
    },
    headerTitle: {
      ...theme.fonts.titleSmall,
    },
  });

export default App;
