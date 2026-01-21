import React, {useContext, useEffect, useState} from 'react';
import {TouchableOpacity, View, Alert, SectionList} from 'react-native';
import {observer} from 'mobx-react';
import {Divider, Drawer, Text} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {DrawerContentComponentProps} from '@react-navigation/drawer';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

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

// Session item props interface
interface SessionItemProps {
  session: SessionMetaData;
  isActive: boolean;
  onPress: (sessionId: string) => void;
  onLongPress: (sessionId: string, event: any) => void;
  menuVisible: string | null;
  menuPosition: {x: number; y: number};
  onMenuDismiss: () => void;
  onPressRename: (session: SessionMetaData) => void;
  onPressDelete: (sessionId: string) => void;
  theme: any;
  styles: any;
  l10n: any;
}

// Memoized session item component
const SessionItem = React.memo<SessionItemProps>(
  ({
    session,
    isActive,
    onPress,
    onLongPress,
    menuVisible,
    menuPosition,
    onMenuDismiss,
    onPressRename,
    onPressDelete,
    theme,
    styles,
    l10n,
  }) => {
    return (
      <View style={styles.sessionItem}>
        <TouchableOpacity
          onPress={() => onPress(session.id)}
          onLongPress={event => onLongPress(session.id, event)}
          style={styles.sessionTouchable}>
          <Drawer.Item
            active={isActive}
            label={session.title}
            style={styles.sessionDrawerItem}
          />
        </TouchableOpacity>
        <Menu
          visible={menuVisible === session.id}
          onDismiss={onMenuDismiss}
          anchor={menuPosition}
          style={styles.menu}
          contentStyle={{}}
          anchorPosition="bottom">
          <Menu.Item
            onPress={() => {
              onPressRename(session);
              onMenuDismiss();
            }}
            label={l10n.common.rename}
            leadingIcon={() => <EditIcon stroke={theme.colors.primary} />}
          />
          <Menu.Item
            onPress={() => onPressDelete(session.id)}
            label={l10n.common.delete}
            labelStyle={{color: theme.colors.error}}
            leadingIcon={() => <TrashIcon stroke={theme.colors.error} />}
          />
        </Menu>
      </View>
    );
  },
);

SessionItem.displayName = 'SessionItem';

export const SidebarContent: React.FC<DrawerContentComponentProps> = observer(
  props => {
    const [menuVisible, setMenuVisible] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState({x: 0, y: 0});
    const [sessionToRename, setSessionToRename] =
      useState<SessionMetaData | null>(null);

    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const insets = useSafeAreaInsets();

    // Convert groupedSessions to SectionList format
    // observer() HOC handles MobX reactivity, transformation is cheap
    const sections = Object.entries(chatSessionStore.groupedSessions).map(
      ([dateLabel, sessions]) => ({
        title: dateLabel,
        data: sessions,
      }),
    );

    useEffect(() => {
      chatSessionStore.loadSessionList();

      // Set localized date group names whenever the component mounts
      chatSessionStore.setDateGroupNames(
        l10n.components.sidebarContent.dateGroups,
      );
    }, [l10n.components.sidebarContent.dateGroups]);

    const openMenu = React.useCallback((sessionId: string, event: any) => {
      const {nativeEvent} = event;
      setMenuPosition({x: nativeEvent.pageX, y: nativeEvent.pageY});
      setMenuVisible(sessionId);
    }, []);

    const closeMenu = React.useCallback(() => {
      setMenuVisible(null);
    }, []);

    const handleSessionPress = React.useCallback(
      async (sessionId: string) => {
        await chatSessionStore.setActiveSession(sessionId);
        props.navigation.navigate(ROUTES.CHAT);
      },
      [props.navigation],
    );

    const handleSessionLongPress = React.useCallback(
      (sessionId: string, event: any) => {
        openMenu(sessionId, event);
      },
      [openMenu],
    );

    const handlePressRename = React.useCallback(
      (session: SessionMetaData) => {
        setSessionToRename(session);
        closeMenu();
      },
      [closeMenu],
    );

    const onPressDelete = React.useCallback(
      (sessionId: string) => {
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
      },
      [l10n, closeMenu],
    );

    // Key extractor for SectionList
    const keyExtractor = React.useCallback(
      (item: SessionMetaData) => item.id,
      [],
    );

    // Render section header (date labels)
    const renderSectionHeader = React.useCallback(
      ({section}: {section: {title: string}}) => (
        <View style={styles.drawerSection}>
          <Text variant="bodySmall" style={styles.dateLabel}>
            {section.title}
          </Text>
        </View>
      ),
      [styles.drawerSection, styles.dateLabel],
    );

    // Render session item
    // observer() HOC handles MobX reactivity for chatSessionStore.activeSessionId
    const renderItem = React.useCallback(
      ({item}: {item: SessionMetaData}) => {
        const isActive = chatSessionStore.activeSessionId === item.id;
        return (
          <SessionItem
            session={item}
            isActive={isActive}
            onPress={handleSessionPress}
            onLongPress={handleSessionLongPress}
            menuVisible={menuVisible}
            menuPosition={menuPosition}
            onMenuDismiss={closeMenu}
            onPressRename={handlePressRename}
            onPressDelete={onPressDelete}
            theme={theme}
            styles={styles}
            l10n={l10n}
          />
        );
      },
      [
        handleSessionPress,
        handleSessionLongPress,
        menuVisible,
        menuPosition,
        closeMenu,
        handlePressRename,
        onPressDelete,
        theme,
        styles,
        l10n,
      ],
    );

    // List header with main menu items
    const ListHeaderComponent = React.useMemo(
      () => (
        <View>
          <Drawer.Section showDivider={false}>
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.chat}
              icon={() => <ChatIcon stroke={theme.colors.primary} />}
              onPress={() => props.navigation.navigate(ROUTES.CHAT)}
              style={styles.menuDrawerItem}
              testID="drawer-item-chat"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.pals}
              icon={() => <PalIcon stroke={theme.colors.primary} />}
              onPress={() => props.navigation.navigate(ROUTES.PALS)}
              style={styles.menuDrawerItem}
              testID="drawer-item-pals"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.models}
              icon={() => <ModelIcon stroke={theme.colors.primary} />}
              onPress={() => props.navigation.navigate(ROUTES.MODELS)}
              style={styles.menuDrawerItem}
              testID="drawer-item-models"
            />
            <Drawer.Item
              label={l10n.components.sidebarContent.menuItems.benchmark}
              icon={() => <BenchmarkIcon stroke={theme.colors.primary} />}
              onPress={() => props.navigation.navigate(ROUTES.BENCHMARK)}
              style={styles.menuDrawerItem}
              testID="drawer-item-benchmark"
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
              testID="drawer-item-settings"
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
        </View>
      ),
      [l10n, theme, styles, props.navigation],
    );

    return (
      <GestureHandlerRootView style={styles.sidebarContainer}>
        <View style={styles.contentWrapper}>
          <SectionList
            sections={sections}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            ListHeaderComponent={ListHeaderComponent}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={[
              styles.scrollViewContent,
              {paddingTop: insets.top},
            ]}
          />
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
