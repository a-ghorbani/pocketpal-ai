import React, {useContext, useEffect, useState} from 'react';
import {
  TouchableOpacity,
  View,
  Alert,
  SectionList,
  useWindowDimensions,
} from 'react-native';
import {observer} from 'mobx-react';
import {
  Button,
  Divider,
  IconButton,
  Searchbar,
  Snackbar,
  Text,
} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {DrawerContentComponentProps} from '@react-navigation/drawer';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {FolderControls} from './FolderControls';
import {FolderDialog, FolderDialogState} from './FolderDialog';
import {chatSessionStore, SessionMetaData} from '../../store';
import {Menu, RenameModal, Checkbox} from '..';
import {EditIcon, ShareIcon, StarIcon, TrashIcon} from '../../assets/icons';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {ROUTES} from '../../utils/navigationConstants';
import {exportChatSession} from '../../utils/exportUtils';

// Check if app is in debug mode
const isDebugMode = __DEV__;

// Session item props interface
interface SessionItemProps {
  session: SessionMetaData;
  isActive: boolean;
  isPinned: boolean;
  onPress: (sessionId: string) => void;
  onLongPress: (sessionId: string, event: any) => void;
  menuVisible: string | null;
  menuPosition: {x: number; y: number};
  onMenuDismiss: () => void;
  onPressPin: (sessionId: string) => void;
  onPressRename: (session: SessionMetaData) => void;
  onPressDelete: (sessionId: string) => void;
  onPressExport: (sessionId: string) => void;
  onPressSelect: (sessionId: string) => void;
  onPressMove: (sessionId: string) => void;
  folderName?: string;
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
    isPinned,
    onPress,
    onLongPress,
    menuVisible,
    menuPosition,
    onMenuDismiss,
    onPressPin,
    onPressRename,
    onPressDelete,
    onPressExport,
    onPressSelect,
    onPressMove,
    folderName,
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
      <View
        style={[
          styles.sessionItemContainer,
          (isSelectionMode ? isSelected : isActive) && styles.activeRow,
        ]}>
        {isSelectionMode && (
          <View
            style={styles.sessionCheckbox}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
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
          accessibilityRole="button"
          accessibilityState={{
            selected: isSelectionMode ? isSelected : isActive,
          }}
          style={styles.sessionMain}>
          <View style={styles.sessionText}>
            <Text style={styles.sessionTitle} numberOfLines={2}>
              {session.title}
            </Text>
            {!!folderName && (
              <Text
                variant="labelSmall"
                style={styles.secondaryText}
                numberOfLines={1}>
                {folderName}
              </Text>
            )}
          </View>
          {isPinned && (
            <StarIcon width={14} height={14} fill={theme.colors.primary} />
          )}
        </TouchableOpacity>
        {!isSelectionMode && (
          <IconButton
            icon="dots-horizontal"
            size={20}
            style={styles.sessionActions}
            accessibilityLabel={t(
              l10n.components.sidebarContent.folders.chatActions,
              {name: session.title},
            )}
            onPress={handleLongPress}
            testID={`session-actions-${session.id}`}
          />
        )}
        {!isSelectionMode && (
          <Menu
            visible={menuVisible === session.id}
            onDismiss={onMenuDismiss}
            anchor={menuPosition}
            style={styles.menu}
            contentStyle={{}}
            anchorPosition="bottom">
            <Menu.Item
              testID={`session-move-${session.id}`}
              onPress={() => {
                onPressMove(session.id);
                onMenuDismiss();
              }}
              label={l10n.components.sidebarContent.folders.moveToFolder}
            />
            <Menu.Item
              testID={`session-pin-${session.id}`}
              onPress={() => {
                onPressPin(session.id);
                onMenuDismiss();
              }}
              label={
                isPinned
                  ? l10n.components.sidebarContent.unpin
                  : l10n.components.sidebarContent.pin
              }
              leadingIcon={() => (
                <StarIcon
                  width={20}
                  height={20}
                  // star.svg is stroke-only and .svgrrc binds that stroke to the
                  // fill prop, so fill='none' paints nothing. Omitting fill is
                  // what yields an outline; no test can catch this (svg is mocked).
                  {...(isPinned
                    ? {fill: theme.colors.primary}
                    : {stroke: theme.colors.primary})}
                />
              )}
            />
            <Divider style={styles.menuDivider} />
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
              label={`${l10n.components.sidebarContent.select}...`}
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
  onCancel: () => void;
  onExport: () => void;
  onDelete: () => void;
  onMove: () => void;
  l10n: any;
  theme: any;
  styles: any;
}

const SelectionModeHeader: React.FC<SelectionModeHeaderProps> = ({
  selectedCount,
  onCancel,
  onExport,
  onDelete,
  onMove,
  l10n,
  theme,
  styles,
}) => {
  return (
    <View>
      <View style={styles.selectionModeHeader}>
        <Button onPress={onCancel} testID="cancel-selection-button">
          {l10n.common.cancel}
        </Button>
        <Text style={styles.selectedCountText}>
          {t(l10n.components.sidebarContent.nSelected, {
            count: String(selectedCount),
          })}
        </Text>
      </View>
      <View style={styles.bulkActions}>
        <Button
          icon="folder-move-outline"
          onPress={onMove}
          disabled={selectedCount === 0}
          accessibilityLabel={
            l10n.components.sidebarContent.folders.moveToFolder
          }
          testID="bulk-move-button">
          {l10n.components.sidebarContent.folders.moveToFolder}
        </Button>
        <IconButton
          icon="export-variant"
          onPress={onExport}
          disabled={selectedCount === 0}
          accessibilityLabel={l10n.common.export}
          testID="bulk-export-button"
        />
        <IconButton
          icon="trash-can-outline"
          iconColor={theme.colors.error}
          onPress={onDelete}
          disabled={selectedCount === 0}
          accessibilityLabel={l10n.common.delete}
          testID="bulk-delete-button"
        />
      </View>
    </View>
  );
};

SelectionModeHeader.displayName = 'SelectionModeHeader';

// Select all row component
interface SelectAllRowProps {
  allSelected: boolean;
  onToggle: () => void;
  l10n: any;
  styles: any;
}

const SelectAllRow: React.FC<SelectAllRowProps> = ({
  allSelected,
  onToggle,
  l10n,
  styles,
}) => {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={styles.selectAllRow}
      accessibilityRole="checkbox"
      accessibilityLabel={l10n.components.sidebarContent.selectAll}
      accessibilityState={{checked: allSelected}}
      testID="select-all-row">
      <View
        style={styles.selectAllCheckbox}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Checkbox checked={allSelected} onPress={onToggle} />
      </View>
      <Text style={styles.selectAllText}>
        {l10n.components.sidebarContent.selectAll}
      </Text>
    </TouchableOpacity>
  );
};

SelectAllRow.displayName = 'SelectAllRow';

export const SidebarContent: React.FC<DrawerContentComponentProps> = observer(
  props => {
    const [menuVisible, setMenuVisible] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState({x: 0, y: 0});
    const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(
      null,
    );
    const [folderMenu, setFolderMenu] = useState<{
      id: string;
      name: string;
    } | null>(null);
    const [moreVisible, setMoreVisible] = useState(false);
    const [folderLoadError, setFolderLoadError] = useState(false);
    const [movedTo, setMovedTo] = useState<{id: string | null} | null>(null);
    const [sessionToRename, setSessionToRename] =
      useState<SessionMetaData | null>(null);

    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const insets = useSafeAreaInsets();
    const {fontScale} = useWindowDimensions();
    const labels = l10n.components.sidebarContent.folders;
    const refreshFolders = React.useCallback(() => {
      chatSessionStore
        .loadFolders()
        .then(() => setFolderLoadError(false))
        .catch(() => setFolderLoadError(true));
    }, []);
    const onMove = React.useCallback((id: string) => {
      setFolderDialog({mode: 'move', sessionIds: [id]});
    }, []);
    const showFolderMenu = (folder: {id: string; name: string}, event: any) => {
      setMenuPosition({x: event.nativeEvent.pageX, y: event.nativeEvent.pageY});
      setFolderMenu(folder);
    };
    const deleteFolder = (folder: {id: string; name: string}) => {
      setFolderMenu(null);
      Alert.alert(
        labels.deleteFolder,
        t(labels.deleteMessage, {name: folder.name}),
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: async () => {
              try {
                await chatSessionStore.deleteFolder(folder.id);
              } catch {
                Alert.alert(l10n.common.error, labels.saveError);
              }
            },
          },
        ],
      );
    };

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
      refreshFolders();

      // Set localized date group names whenever the component mounts
      chatSessionStore.setDateGroupNames(
        l10n.components.sidebarContent.dateGroups,
      );
    }, [l10n.components.sidebarContent.dateGroups, refreshFolders]);

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

    const handlePressPin = React.useCallback(async (sessionId: string) => {
      await chatSessionStore.togglePinSession(sessionId);
    }, []);

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
        t(l10n.components.sidebarContent.bulkDeleteMessage, {
          count: count.toString(),
        }),
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
            isPinned={item.pinned || false}
            onPress={handleSessionPress}
            onLongPress={handleSessionLongPress}
            menuVisible={menuVisible}
            menuPosition={menuPosition}
            onMenuDismiss={closeMenu}
            onPressPin={handlePressPin}
            onPressRename={handlePressRename}
            onPressDelete={onPressDelete}
            onPressExport={handlePressExport}
            onPressSelect={handlePressSelect}
            onPressMove={onMove}
            folderName={
              chatSessionStore.folderFilter === null
                ? chatSessionStore.folders.find(
                    folder => folder.id === item.folderId,
                  )?.name
                : undefined
            }
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
        handlePressPin,
        handlePressRename,
        onPressDelete,
        handlePressExport,
        handlePressSelect,
        onMove,
        handleToggleSelection,
        theme,
        styles,
        l10n,
      ],
    );

    return (
      <GestureHandlerRootView style={styles.sidebarContainer}>
        <View
          key={fontScale}
          style={[
            styles.contentWrapper,
            {paddingTop: insets.top, paddingBottom: insets.bottom},
          ]}>
          {chatSessionStore.isSelectionMode ? (
            <>
              <SelectionModeHeader
                selectedCount={chatSessionStore.selectedCount}
                onCancel={handleExitSelectionMode}
                onExport={handleBulkExport}
                onDelete={handleBulkDelete}
                onMove={() =>
                  setFolderDialog({
                    mode: 'move',
                    sessionIds: chatSessionStore.visibleSessions
                      .filter(session =>
                        chatSessionStore.selectedSessionIds.has(session.id),
                      )
                      .map(session => session.id),
                  })
                }
                l10n={l10n}
                theme={theme}
                styles={styles}
              />
              <SelectAllRow
                allSelected={chatSessionStore.allSelected}
                onToggle={() =>
                  chatSessionStore.allSelected
                    ? chatSessionStore.deselectAllSessions()
                    : chatSessionStore.selectAllSessions()
                }
                l10n={l10n}
                styles={styles}
              />
            </>
          ) : (
            <>
              <View style={styles.topBar}>
                <Text variant="titleLarge" accessibilityRole="header">
                  {labels.chats}
                </Text>
                <Button
                  mode="contained-tonal"
                  icon="plus"
                  accessibilityLabel={labels.newChat}
                  testID="new-chat-button"
                  disabled={
                    chatSessionStore.isGenerating || chatSessionStore.isStopping
                  }
                  onPress={() => {
                    chatSessionStore.setSessionSearch('');
                    chatSessionStore.resetActiveSession();
                    props.navigation.navigate(ROUTES.CHAT);
                    props.navigation.closeDrawer();
                  }}>
                  {labels.newChat}
                </Button>
              </View>
              <Searchbar
                placeholder={labels.searchChats}
                accessibilityLabel={labels.searchChats}
                value={chatSessionStore.sessionSearch}
                onChangeText={query => chatSessionStore.setSessionSearch(query)}
                style={styles.search}
                testID="chat-search"
              />
              {folderLoadError ? (
                <Button onPress={refreshFolders}>
                  {labels.loadError} {labels.retry}
                </Button>
              ) : (
                <FolderControls
                  onCreate={() => setFolderDialog({mode: 'create'})}
                  onFolderMenu={showFolderMenu}
                />
              )}
              <View style={styles.historyHeading}>
                <Text
                  variant="labelLarge"
                  numberOfLines={2}
                  style={styles.folderTitle}>
                  {chatSessionStore.folders.find(
                    folder => folder.id === chatSessionStore.folderFilter,
                  )?.name ||
                    (chatSessionStore.folderFilter === 'unfiled'
                      ? labels.unfiled
                      : labels.allChats)}
                </Text>
                <Button
                  compact
                  disabled={sections.every(
                    section => section.data.length === 0,
                  )}
                  onPress={() => chatSessionStore.enterSelectionMode()}
                  testID="select-chats-button">
                  {l10n.components.sidebarContent.select}
                </Button>
              </View>
            </>
          )}
          <SectionList
            sections={sections}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            style={styles.historyList}
            contentContainerStyle={styles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            extraData={[
              chatSessionStore.activeSessionId,
              chatSessionStore.isSelectionMode,
              ...chatSessionStore.selectedSessionIds,
            ]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text variant="titleMedium">
                  {chatSessionStore.sessionSearch.trim()
                    ? labels.emptySearch
                    : chatSessionStore.newSessionFolderId
                      ? labels.emptyFolder
                      : labels.emptyHistory}
                </Text>
                {chatSessionStore.sessionSearch.trim() ? (
                  <Button onPress={() => chatSessionStore.setSessionSearch('')}>
                    {labels.clearSearch}
                  </Button>
                ) : chatSessionStore.newSessionFolderId ? (
                  <Text style={styles.secondaryText}>{labels.emptyHint}</Text>
                ) : null}
              </View>
            }
          />
          {!chatSessionStore.isSelectionMode && (
            <View style={styles.footer}>
              {[
                {
                  route: ROUTES.PALS,
                  label: l10n.components.sidebarContent.menuItems.pals,
                  id: 'pals',
                },
                {
                  route: ROUTES.MODELS,
                  label: l10n.components.sidebarContent.menuItems.models,
                  id: 'models',
                },
                {
                  route: ROUTES.SETTINGS,
                  label: l10n.components.sidebarContent.menuItems.settings,
                  id: 'settings',
                },
              ].map(item => (
                <TouchableOpacity
                  key={item.route}
                  style={styles.footerButton}
                  accessibilityRole="button"
                  onPress={() => props.navigation.navigate(item.route)}
                  testID={`drawer-item-${item.id}`}>
                  <Text variant="labelLarge">{item.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.footerButton}
                accessibilityRole="button"
                testID="drawer-more"
                onPress={event => {
                  setMenuPosition({
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY,
                  });
                  setMoreVisible(true);
                }}>
                <Text variant="labelLarge">{labels.more}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Menu
          visible={!!folderMenu}
          onDismiss={() => setFolderMenu(null)}
          anchor={menuPosition}>
          <Menu.Item
            label={labels.renameFolder}
            onPress={() => {
              if (folderMenu) {
                setFolderDialog({mode: 'rename', folder: folderMenu});
                setFolderMenu(null);
              }
            }}
          />
          <Menu.Item
            label={labels.deleteFolder}
            labelStyle={{color: theme.colors.error}}
            onPress={() => {
              if (folderMenu) {
                deleteFolder(folderMenu);
              }
            }}
          />
        </Menu>
        <Menu
          visible={moreVisible}
          onDismiss={() => setMoreVisible(false)}
          anchor={menuPosition}>
          <Menu.Item
            label={l10n.components.sidebarContent.menuItems.benchmark}
            onPress={() => {
              setMoreVisible(false);
              props.navigation.navigate(ROUTES.BENCHMARK);
            }}
          />
          <Menu.Item
            label={l10n.components.sidebarContent.menuItems.appInfo}
            onPress={() => {
              setMoreVisible(false);
              props.navigation.navigate(ROUTES.APP_INFO);
            }}
          />
          {isDebugMode && (
            <Menu.Item
              label="Dev Tools"
              onPress={() => {
                setMoreVisible(false);
                props.navigation.navigate(ROUTES.DEV_TOOLS);
              }}
            />
          )}
        </Menu>
        {folderDialog && (
          <FolderDialog
            state={folderDialog}
            onClose={() => setFolderDialog(null)}
            onMoved={id => setMovedTo({id})}
          />
        )}
        <Snackbar
          visible={movedTo !== null}
          onDismiss={() => setMovedTo(null)}
          action={{
            label: labels.viewFolder,
            onPress: () => {
              chatSessionStore.setSessionSearch('');
              chatSessionStore.setFolderFilter(movedTo?.id || 'unfiled');
              setMovedTo(null);
            },
          }}>
          {t(labels.moved, {
            name:
              chatSessionStore.folders.find(folder => folder.id === movedTo?.id)
                ?.name || labels.unfiled,
          })}
        </Snackbar>
        <RenameModal
          visible={sessionToRename !== null}
          onClose={() => setSessionToRename(null)}
          session={sessionToRename}
        />
      </GestureHandlerRootView>
    );
  },
);
