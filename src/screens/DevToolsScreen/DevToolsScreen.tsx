import React from 'react';
import {View, ScrollView, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Card, Text, Button, IconButton} from 'react-native-paper';
import {createStackNavigator} from '@react-navigation/stack';
import {useNavigation, ParamListBase} from '@react-navigation/native';
import {DrawerNavigationProp} from '@react-navigation/drawer';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {TestCompletionScreen, DatabaseInspectorScreen} from './screens';

// Define the stack navigator param list
type DevToolsStackParamList = {
  DevToolsHome: undefined;
  TestCompletion: undefined;
  DatabaseInspector: undefined;
};

const Stack = createStackNavigator<DevToolsStackParamList>();

// Define the navigation type
type DevToolsScreenNavigationProp = DrawerNavigationProp<ParamListBase>;

// Header button components
const BackButton = ({
  canGoBack,
  onPress,
  navigation,
}: {
  canGoBack?: boolean;
  onPress?: () => void;
  navigation: DevToolsScreenNavigationProp;
}) => (
  <IconButton
    icon="arrow-left"
    onPress={() => {
      if (canGoBack && onPress) {
        onPress();
      } else {
        navigation.goBack();
      }
    }}
  />
);

const MenuButton = ({
  navigation,
}: {
  navigation: DevToolsScreenNavigationProp;
}) => <IconButton icon="menu" onPress={() => navigation.openDrawer()} />;

// Main DevTools Home Screen
const DevToolsHomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const theme = useTheme();
  const styles = createStyles(theme);

  const resetMigration = async () => {
    try {
      await chatSessionRepository.resetMigration();
      Alert.alert(
        'Success',
        'Migration reset successful. Please restart the app.',
      );
    } catch (error) {
      console.error('Failed to reset migration:', error);
      Alert.alert(
        'Error',
        'Failed to reset migration: ' + (error as Error).message,
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        <Card elevation={1} style={styles.card}>
          <Card.Title title="Developer Tools" />
          <Card.Content>
            <Text variant="bodyMedium" style={styles.description}>
              These tools are for development and debugging purposes only. They
              will not be available in the release version of the app.
            </Text>
          </Card.Content>
        </Card>

        {/* Test Completion Card */}
        <Card elevation={1} style={styles.card}>
          <Card.Title title="Test Completion" />
          <Card.Content>
            <Text variant="bodyMedium" style={styles.description}>
              Test the completion API with various parameters and see the
              results. Useful for debugging model behavior and testing different
              completion settings.
            </Text>
            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                onPress={() => navigation.navigate('TestCompletion' as never)}
                style={styles.button}>
                Open Test Completion
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Database Inspector Card */}
        <Card elevation={1} style={styles.card}>
          <Card.Title title="Database Inspector" />
          <Card.Content>
            <Text variant="bodyMedium" style={styles.description}>
              View and inspect the contents of the database tables. Useful for
              debugging data persistence issues and verifying database
              structure.
            </Text>
            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                onPress={() =>
                  navigation.navigate('DatabaseInspector' as never)
                }
                style={styles.button}>
                Open Database Inspector
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Database Migration Card */}
        <Card elevation={1} style={styles.card}>
          <Card.Title title="Database Migration" />
          <Card.Content>
            <Text variant="bodyMedium" style={styles.description}>
              Reset the database migration flag and clear the database. This is
              useful for testing the migration process from JSON to database
              storage.
            </Text>
            <Text variant="bodyMedium" style={styles.warningText}>
              Warning: This will delete all data in the database!
            </Text>
            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                onPress={() => {
                  Alert.alert(
                    'Reset Database Migration',
                    'This will delete all data in the database. Are you sure you want to continue?',
                    [
                      {
                        text: 'Cancel',
                        style: 'cancel',
                      },
                      {
                        text: 'Reset',
                        style: 'destructive',
                        onPress: resetMigration,
                      },
                    ],
                  );
                }}
                style={styles.button}>
                Reset Migration
              </Button>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

// Stack Navigator for DevTools
export const DevToolsScreen: React.FC = () => {
  const theme = useTheme();
  const drawerNavigation = useNavigation<DevToolsScreenNavigationProp>();

  // Create header left component function
  const createHeaderLeft = (props: any) => (
    <BackButton
      navigation={drawerNavigation}
      canGoBack={props.canGoBack}
      onPress={props.onPress}
    />
  );

  // Create header options
  const screenOptions = {
    headerStyle: {
      backgroundColor: theme.colors.background,
    },
    headerTintColor: theme.colors.onBackground,
    headerLeft: createHeaderLeft,
  };

  // Create header menu component function
  const createHeaderMenu = () => <MenuButton navigation={drawerNavigation} />;

  // Create home screen options
  const homeScreenOptions = {
    title: 'Dev Tools',
    headerLeft: createHeaderMenu,
  };

  return (
    <Stack.Navigator
      initialRouteName="DevToolsHome"
      screenOptions={screenOptions}>
      <Stack.Screen
        name="DevToolsHome"
        component={DevToolsHomeScreen}
        options={homeScreenOptions}
      />
      <Stack.Screen
        name="TestCompletion"
        component={TestCompletionScreen}
        options={{
          title: 'Test Completion',
        }}
      />
      <Stack.Screen
        name="DatabaseInspector"
        component={DatabaseInspectorScreen}
        options={{
          title: 'Database Inspector',
        }}
      />
    </Stack.Navigator>
  );
};
