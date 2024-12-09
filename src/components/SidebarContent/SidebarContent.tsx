import React, {useEffect, useState} from 'react';
import {TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {observer} from 'mobx-react';
import {Drawer, Text} from 'react-native-paper';
import DeviceInfo from 'react-native-device-info';
import Clipboard from '@react-native-clipboard/clipboard';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {chatSessionStore} from '../../store';

import {AppleStyleSwipeableRow} from '..';

export const SidebarContent: React.FC<DrawerContentComponentProps> = observer(
  props => {
    const [appInfo, setAppInfo] = useState({
      version: '',
      build: '',
    });

    useEffect(() => {
      chatSessionStore.loadSessionList();

      // Get app version and build number
      const version = DeviceInfo.getVersion();
      const buildNumber = DeviceInfo.getBuildNumber();
      setAppInfo({
        version,
        build: buildNumber,
      });
    }, []);

    const theme = useTheme();
    const styles = createStyles(theme);

    const copyVersionToClipboard = () => {
      const versionString = `Version ${appInfo.version} (${appInfo.build})`;
      Clipboard.setString(versionString);
    };

    return (
      <GestureHandlerRootView style={styles.sidebarContainer}>
        <View style={styles.contentWrapper}>
          <DrawerContentScrollView {...props}>
            <Drawer.Section>
              <Drawer.Item
                label={'Chat'}
                icon={'comment-text'}
                onPress={() => props.navigation.navigate('Chat')}
              />
              <Drawer.Item
                label={'Models'}
                icon={'view-grid'}
                onPress={() => props.navigation.navigate('Models')}
              />
              <Drawer.Item
                label={'Settings'}
                icon={'cog'}
                onPress={() => props.navigation.navigate('Settings')}
              />
            </Drawer.Section>

            {/* Loop over the session groups and render them */}
            {Object.entries(chatSessionStore.groupedSessions).map(
              ([dateLabel, sessions]) => (
                <Drawer.Section key={dateLabel} style={styles.drawerSection}>
                  <Text variant="bodySmall" style={styles.dateLabel}>
                    {dateLabel}
                  </Text>
                  {sessions.map(session => {
                    const isActive =
                      chatSessionStore.activeSessionId === session.id;
                    return (
                      <AppleStyleSwipeableRow
                        key={session.id} // Ensure each swipeable row has a unique key
                        onDelete={() =>
                          chatSessionStore.deleteSession(session.id)
                        }>
                        <Drawer.Item
                          active={isActive}
                          key={session.id}
                          label={session.title}
                          onPress={() => {
                            chatSessionStore.setActiveSession(session.id);
                            props.navigation.navigate('Chat');
                            console.log(`Navigating to session: ${session.id}`);
                          }}
                        />
                      </AppleStyleSwipeableRow>
                    );
                  })}
                </Drawer.Section>
              ),
            )}
          </DrawerContentScrollView>

          <SafeAreaView edges={['bottom']} style={styles.versionSafeArea}>
            <TouchableOpacity
              onPress={copyVersionToClipboard}
              style={styles.versionContainer}>
              <View style={styles.versionRow}>
                <Text style={styles.versionLabel}>Version</Text>
                <Text style={styles.versionText}>{appInfo.version}</Text>
                <Text style={styles.buildText}>({appInfo.build})</Text>
              </View>
              <Text style={styles.copyHint}>Tap to copy</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </GestureHandlerRootView>
    );
  },
);
