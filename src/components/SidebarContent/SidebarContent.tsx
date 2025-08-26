import React, {useContext, useEffect, useState} from 'react';
import {TouchableOpacity, View, Alert} from 'react-native';
import {observer} from 'mobx-react';
import {Divider, Drawer, Text} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {chatSessionStore, SessionMetaData} from '../../store';
import {Menu, RenameModal} from '..';
import {
  BenchmarkIcon,
  ChatIcon,
  EditIcon,
  ModelIcon,
  PalIcon,
  SettingsIcon,
  TrashIcon,
  AppInfoIcon,
} from '../../assets/icons';
import {L10nContext} from '../../utils';
import {ROUTES} from '../../utils/navigationConstants';

// Check if app is in debug mode
const isDebugMode = __DEV__;

export const SidebarContent: React.FC<DrawerContentComponentProps> = observer(
  props => {
    const [menuVisible, setMenuVisible] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState({x: 0, y: 0});
    const [sessionToRename, setSessionToRename] =
      useState<SessionMetaData | null>(null);

    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    useEffect(() => {
      chatSessionStore.loadSessionList();

      // Set localized date group names whenever the component mounts
      chatSessionStore.setDateGroupNames(
        l10n.components.sidebarContent.dateGroups,
      );
    }, [l10n.components.sidebarContent.dateGroups]);

    const openMenu = (sessionId: string, event: any) => {
      const {nativeEvent} = event;
      setMenuPosition({x: nativeEvent.pageX, y: nativeEvent.pageY});
      setMenuVisible(sessionId);
    };

    const closeMenu = () => setMenuVisible(null);

    const onPressDelete = (sessionId: string) => {
      if (sessionId) {
        Alert.alert(
          l10n.components.sidebarContent.deleteChatTitle,
          l10n.components.sidebarContent.deleteChatMessage,
          [
            {
              text: l10n.common.cancel,
              style: 'cancel',
            },
            {
              text: l10n.common.delete,
              style: 'destructive',
              onPress: async () => {
                chatSessionStore.resetActiveSession();
                await chatSessionStore.deleteSession(sessionId);
                closeMenu();
              },
            },
          ],
        );
      }
      closeMenu();
    };

    return (
      <GestureHandlerRootView style={styles.sidebarContainer}>
        <View style={styles.contentWrapper}>
          <DrawerContentScrollView {...props}>
            <Drawer.Section showDivider={false}>
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.chat}
                icon={() => <ChatIcon stroke={theme.colors.primary} />}
                onPress={() => props.navigation.navigate(ROUTES.CHAT)}
                style={styles.menuDrawerItem}
              />
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.models}
                icon={() => <ModelIcon stroke={theme.colors.primary} />}
                onPress={() => props.navigation.navigate(ROUTES.MODELS)}
                style={styles.menuDrawerItem}
              />
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.pals}
                icon={() => <PalIcon stroke={theme.colors.primary} />}
                onPress={() => props.navigation.navigate(ROUTES.PALS)}
                style={styles.menuDrawerItem}
              />
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.benchmark}
                icon={() => <BenchmarkIcon stroke={theme.colors.primary} />}
                onPress={() => props.navigation.navigate(ROUTES.BENCHMARK)}
                style={styles.menuDrawerItem}
              />
              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.settings}
                icon={() => (
                  <SettingsIcon
                    width={24}
                    height={24}
                    stroke={theme.colors.primary}
                  />
                )}
                onPress={() => props.navigation.navigate(ROUTES.SETTINGS)}
                style={styles.menuDrawerItem}
              />

              <Drawer.Item
                label={l10n.components.sidebarContent.menuItems.appInfo}
                icon={() => (
                  <AppInfoIcon
                    width={24}
                    height={24}
                    stroke={theme.colors.primary}
                  />
                )}
                onPress={() => props.navigation.navigate(ROUTES.APP_INFO)}
                style={styles.menuDrawerItem}
              />

              {/* Only show Dev Tools in debug mode */}
              {isDebugMode && (
                <Drawer.Item
                  label="Dev Tools"
                  icon={() => (
                    <SettingsIcon
                      width={24}
                      height={24}
                      stroke={theme.colors.primary}
                    />
                  )}
                  onPress={() => props.navigation.navigate(ROUTES.DEV_TOOLS)}
                  style={styles.menuDrawerItem}
                />
              )}
            </Drawer.Section>
            <Divider style={styles.divider} />
            {/* Loop over the session groups and render them */}
            {Object.entries(chatSessionStore.groupedSessions).map(
              ([dateLabel, sessions]) => (
                <View key={dateLabel} style={styles.drawerSection}>
                  <Text variant="bodySmall" style={styles.dateLabel}>
                    {dateLabel}
                  </Text>
                  {sessions.map(session => {
                    const isActive =
                      chatSessionStore.activeSessionId === session.id;
                    return (
                      <View key={session.id} style={styles.sessionItem}>
                        <TouchableOpacity
                          onPress={() => {
                            chatSessionStore.setActiveSession(session.id);
                            props.navigation.navigate(ROUTES.CHAT);
                          }}
                          onLongPress={event => openMenu(session.id, event)}
                          style={styles.sessionTouchable}>
                          <Drawer.Item
                            active={isActive}
                            label={session.title}
                            style={styles.sessionDrawerItem}
                          />
                        </TouchableOpacity>

                        {/* Menu for the session item */}
                        <Menu
                          visible={menuVisible === session.id}
                          onDismiss={closeMenu}
                          anchor={menuPosition}
                          style={styles.menu}
                          contentStyle={{}}
                          anchorPosition="bottom">
                          <Menu.Item
                            onPress={() => {
                              setSessionToRename(session);
                              closeMenu();
                            }}
                            label={l10n.common.rename}
                            leadingIcon={() => (
                              <EditIcon stroke={theme.colors.primary} />
                            )}
                          />
                          <Menu.Item
                            onPress={() => onPressDelete(session.id)}
                            label={l10n.common.delete}
                            labelStyle={{color: theme.colors.error}}
                            leadingIcon={() => (
                              <TrashIcon stroke={theme.colors.error} />
                            )}
                          />
                        </Menu>
                      </View>
                    );
                  })}
                </View>
              ),
            )}
          </DrawerContentScrollView>
        </View>
        <RenameModal
          visible={sessionToRename !== null}
          onClose={() => setSessionToRename(null)}
          session={sessionToRename}
        />
      </GestureHandlerRootView>
    );
  },
);
