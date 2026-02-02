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
import {Menu, RenameModal, Checkbox} from '..';
import {
  BenchmarkIcon,
  ChatIcon,
  CheckCircleIcon,
  EditIcon,
  ModelIcon,
  PalIcon,
  SettingsIcon,
  ShareIcon,
  TrashIcon,
  AppInfoIcon,
} from '../../assets/icons';
import {L10nContext} from '../../utils';
import {ROUTES} from '../../utils/navigationConstants';
import {exportChatSession} from '../../utils/exportUtils';

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
  onPressExport: (sessionId: string) => void;
  onPressSelect: (sessionId: string) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: (sessionId: string) => void;
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
    onPressExport,
    onPressSelect,
    isSelectionMode,
    isSelected,
    onToggleSelection,
    theme,
    styles,
    l10n,
  }) => {
    const handlePress = () => {
      if (isSelectionMode) {
        onToggleSelection(session.id);
      } else {
        onPress(session.id);
      }
    };

    const handleLongPress = (event: any) => {
      if (!isSelectionMode) {
        onLongPress(session.id, event);
      }
    };

    return (
      <View style={styles.sessionItemContainer}>
        {isSelectionMode && (
          <View style={styles.sessionCheckbox}>
            <Checkbox
              checked={isSelected}
              onPress={() => onToggleSelection(session.id)}
              testID={`checkbox-${session.id}`}
            />
          </View>
        )}
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={handleLongPress}
          style={styles.sessionTouchable}>
          <Drawer.Item
            active={isActive}
            label={session.title}
            style={styles.sessionDrawerItem}
          />
        </TouchableOpacity>
        {!isSelectionMode && (
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
              onPress={() => {
                onPressExport(session.id);
                onMenuDismiss();
              }}
              label={l10n.common.export}
              leadingIcon={() => <ShareIcon stroke={theme.colors.primary} />}
            />
            <Menu.Item
              onPress={() => {
                onPressDelete(session.id);
                onMenuDismiss();
              }}
              label={l10n.common.delete}
              labelStyle={{color: theme.colors.error}}
              leadingIcon={() => <TrashIcon stroke={theme.colors.error} />}
            />
            <Divider style={styles.menuDivider} />
            <Menu.Item
              onPress={() => {
                onPressSelect(session.id);
                onMenuDismiss();
              }}
              label={l10n.components.sidebarContent.select}
              leadingIcon={() => (
                <CheckCircleIcon stroke={theme.colors.primary} />
              )}
            />
          </Menu>
        )}
      </View>
    );
  },
);

SessionItem.displayName = 'SessionItem';

// Selection mode header component
interface SelectionModeHeaderProps {
  selectedCount: number;
  allSelected: boolean;
  onCancel: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onExport: () => void;
  onDelete: () => void;
  l10n: any;
  theme: any;
  styles: any;
}

const SelectionModeHeader: React.FC<SelectionModeHeaderProps> = ({
  selectedCount,
  allSelected,
  onCancel,
  onSelectAll,
  onDeselectAll,
  onExport,
  onDelete,
  l10n,
  theme,
  styles,
}) => {
  const [overflowVisible, setOverflowVisible] = React.useState(false);

  return (
    <View style={styles.selectionModeHeader}>
      <TouchableOpacity onPress={onCancel} testID="cancel-selection-button">
        <Text style={{color: theme.colors.primary}}>{l10n.common.cancel}</Text>
      </TouchableOpacity>

      <Text style={styles.selectedCountText}>
        {l10n.components.sidebarContent.nSelected.replace(
          '{{count}}',
          selectedCount.toString(),
        )}
      </Text>

      <Menu
        visible={overflowVisible}
        onDismiss={() => setOverflowVisible(false)}
        anchor={
          <TouchableOpacity
            onPress={() => setOverflowVisible(true)}
            testID="overflow-menu-button">
            <Text style={styles.overflowMenuButton}>•••</Text>
          </TouchableOpacity>
        }
        anchorPosition="bottom">
        <Menu.Item
          onPress={() => {
            allSelected ? onDeselectAll() : onSelectAll();
            setOverflowVisible(false);
          }}
          label={
            allSelected
              ? l10n.components.sidebarContent.deselectAll
              : l10n.components.sidebarContent.selectAll
          }
        />
        <Divider />
        <Menu.Item
          onPress={() => {
            onExport();
            setOverflowVisible(false);
          }}
          label={l10n.components.sidebarContent.exportCount.replace(
            '{{count}}',
            selectedCount.toString(),
          )}
          disabled={selectedCount === 0}
        />
        <Menu.Item
          onPress={() => {
            onDelete();
            setOverflowVisible(false);
          }}
          label={l10n.components.sidebarContent.deleteCount.replace(
            '{{count}}',
            selectedCount.toString(),
          )}
          labelStyle={{color: theme.colors.error}}
          disabled={selectedCount === 0}
        />
      </Menu>
    </View>
  );
};

SelectionModeHeader.displayName = 'SelectionModeHeader';

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

    const handlePressExport = React.useCallback(
      async (sessionId: string) => {
        try {
          await exportChatSession(sessionId);
        } catch {
          Alert.alert(
            l10n.common.error,
            l10n.components.sidebarContent.exportError,
          );
        }
      },
      [l10n],
    );

    const handlePressSelect = React.useCallback(
      (sessionId: string) => {
        chatSessionStore.enterSelectionMode(sessionId);
        closeMenu();
      },
      [closeMenu],
    );

    const handleExitSelectionMode = React.useCallback(() => {
      chatSessionStore.exitSelectionMode();
    }, []);

    const handleToggleSelection = React.useCallback((sessionId: string) => {
      chatSessionStore.toggleSessionSelection(sessionId);
    }, []);

    const handleBulkDelete = React.useCallback(() => {
      const count = chatSessionStore.selectedCount;

      Alert.alert(
        l10n.components.sidebarContent.bulkDeleteTitle,
        l10n.components.sidebarContent.bulkDeleteMessage.replace(
          '{{count}}',
          count.toString(),
        ),
        [
          {
            text: l10n.common.cancel,
            style: 'cancel',
          },
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: async () => {
              try {
                await chatSessionStore.bulkDeleteSessions();
              } catch {
                Alert.alert(
                  l10n.common.error,
                  l10n.components.sidebarContent.bulkDeleteError,
                );
              }
            },
          },
        ],
      );
    }, [l10n]);

    const handleBulkExport = React.useCallback(async () => {
      try {
        await chatSessionStore.bulkExportSessions();
      } catch {
        Alert.alert(
          l10n.common.error,
          l10n.components.sidebarContent.bulkExportError,
        );
      }
    }, [l10n]);

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
        const isSelected = chatSessionStore.selectedSessionIds.has(item.id);
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
            onPressExport={handlePressExport}
            onPressSelect={handlePressSelect}
            isSelectionMode={chatSessionStore.isSelectionMode}
            isSelected={isSelected}
            onToggleSelection={handleToggleSelection}
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
        handlePressExport,
        handlePressSelect,
        handleToggleSelection,
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
        <View style={[styles.contentWrapper, {paddingTop: insets.top}]}>
          {chatSessionStore.isSelectionMode ? (
            <>
              <SelectionModeHeader
                selectedCount={chatSessionStore.selectedCount}
                allSelected={chatSessionStore.allSelected}
                onCancel={handleExitSelectionMode}
                onSelectAll={() => chatSessionStore.selectAllSessions()}
                onDeselectAll={() => chatSessionStore.deselectAllSessions()}
                onExport={handleBulkExport}
                onDelete={handleBulkDelete}
                l10n={l10n}
                theme={theme}
                styles={styles}
              />
              <SectionList
                sections={sections}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={styles.scrollViewContent}
              />
            </>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              ListHeaderComponent={ListHeaderComponent}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.scrollViewContent}
            />
          )}
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
