import React, {useContext} from 'react';
import {Alert, Keyboard, View} from 'react-native';

import {observer} from 'mobx-react';
import {IconButton, useTheme} from 'react-native-paper';

import {
  // ClockFastForwardIcon,
  DotsVerticalIcon,
  DuplicateIcon,
  EditBoxIcon,
  EditIcon,
  GridIcon,
  SettingsIcon,
  ShareIcon,
  TrashIcon,
} from '../../assets/icons';

import {Menu} from '../Menu';
import {styles} from './styles';

import {chatSessionStore, modelStore, uiStore} from '../../store';

import {L10nContext} from '../../utils';
import {Model} from '../../utils/types';
import {t} from '../../locales';
import {importChatSessions} from '../../utils/importUtils';
import {
  exportChatSession,
  exportAllChatSessions,
} from '../../utils/exportUtils';

import {RenameModal, UsageStats} from '..';
import {ChatGenerationSettingsSheet} from '..';

export const HeaderRight: React.FC = observer(() => {
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [renameModalVisible, setRenameModalVisible] = React.useState(false);
  const [chatGenerationSettingsVisible, setChatGenerationSettingsVisible] =
    React.useState(false);

  const openMenu = () => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
    }
    setMenuVisible(true);
  };
  const closeMenu = () => setMenuVisible(false);
  const l10n = useContext(L10nContext);

  const models = modelStore.availableModels;
  const activeModelId = modelStore.activeModelId;
  const session = chatSessionStore.sessions.find(
    s => s.id === chatSessionStore.activeSessionId,
  );

  const onSelectModel = (model: Model) => {
    modelStore.initContext(model);
    closeMenu();
  };

  const onPressGenerationSettings = () => {
    setChatGenerationSettingsVisible(true);
    closeMenu();
  };

  const onPressDelete = () => {
    if (session?.id) {
      Alert.alert(
        l10n.components.headerRight.deleteChatTitle,
        l10n.components.headerRight.deleteChatMessage,
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
              await chatSessionStore.deleteSession(session.id);
              closeMenu();
            },
          },
        ],
      );
    }
    closeMenu();
  };

  const onPressDuplicate = async () => {
    if (session?.id) {
      await chatSessionStore.duplicateSession(session.id);
      closeMenu();
    }
  };

  const onPressRename = () => {
    setRenameModalVisible(true);
    closeMenu();
  };

  const onPressExportCurrentSession = async () => {
    if (session?.id) {
      try {
        await exportChatSession(session.id);
      } catch (error) {
        console.error('Error exporting current session:', error);
        Alert.alert('Export Error', 'Failed to export the current session.');
      }
    }
    closeMenu();
  };

  const onPressExportAllSessions = async () => {
    try {
      await exportAllChatSessions();
    } catch (error) {
      console.error('Error exporting all sessions:', error);
      Alert.alert('Export Error', 'Failed to export all sessions.');
    }
    closeMenu();
  };

  const onPressImportSessions = async () => {
    try {
      const count = await importChatSessions();
      if (count > 0) {
        Alert.alert(
          'Import Success',
          t(l10n.settings.importSuccess, {count: count.toString()}),
        );
        // Refresh the chat sessions
        await chatSessionStore.loadSessionList();
      }
    } catch (error) {
      console.error('Error importing sessions:', error);
      Alert.alert('Import Error', l10n.settings.importError);
    }
    closeMenu();
  };

  return (
    <View style={styles.headerRightContainer}>
      {uiStore.displayMemUsage && <UsageStats width={40} height={20} />}
      <IconButton
        icon={() => <EditBoxIcon stroke={theme.colors.primary} />}
        testID="reset-button"
        style={styles.chatBtn}
        onPress={() => {
          chatSessionStore.resetActiveSession();
        }}
      />
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchorPosition="bottom"
        anchor={
          <IconButton
            icon={() => <DotsVerticalIcon fill={theme.colors.primary} />}
            style={styles.menuBtn}
            onPress={openMenu}
            testID="menu-button"
          />
        }>
        <Menu.Item
          onPress={onPressGenerationSettings}
          label={l10n.components.headerRight.generationSettings}
          leadingIcon={() => <SettingsIcon stroke={theme.colors.primary} />}
        />
        <Menu.Item
          disabled={models.length === 0}
          submenu={models.map(model => (
            <Menu.Item
              label={model.name}
              onPress={() => onSelectModel(model)}
              key={model.id}
              selectable
              selected={model.id === activeModelId}
            />
          ))}
          label={l10n.components.headerRight.model}
          leadingIcon={() => <GridIcon stroke={theme.colors.primary} />}
        />
        {session?.id && (
          <>
            <Menu.Separator />
            <Menu.Item
              onPress={onPressDuplicate}
              label={l10n.components.headerRight.duplicateChatHistory}
              leadingIcon={() => (
                <DuplicateIcon stroke={theme.colors.primary} />
              )}
            />
            <Menu.Item
              onPress={onPressRename}
              label={l10n.common.rename}
              leadingIcon={() => <EditIcon stroke={theme.colors.primary} />}
            />
            <Menu.Item
              onPress={onPressDelete}
              label={l10n.common.delete}
              labelStyle={{color: theme.colors.error}}
              leadingIcon={() => <TrashIcon stroke={theme.colors.error} />}
            />
            {/* <Menu.Separator />
            <Menu.Item
              onPress={() => {}}
              label={l10n.components.headerRight.makeChatTemporary}
              leadingIcon={() => (
                <ClockFastForwardIcon stroke={theme.colors.primary} />
              )}
            /> */}
          </>
        )}
        <Menu.Item
          submenu={[
            <Menu.Item
              disabled={!session?.id}
              key="export-current"
              onPress={onPressExportCurrentSession}
              label={l10n.components.headerRight.exportCurrentSession}
            />,
            <Menu.Item
              key="export-all"
              onPress={onPressExportAllSessions}
              label={l10n.components.headerRight.exportAllSessions}
            />,
            <Menu.Item
              key="import"
              onPress={onPressImportSessions}
              label={l10n.components.headerRight.importSessions}
            />,
          ]}
          label={l10n.components.headerRight.export}
          leadingIcon={() => <ShareIcon stroke={theme.colors.primary} />}
        />
      </Menu>
      <ChatGenerationSettingsSheet
        isVisible={chatGenerationSettingsVisible}
        onClose={() => setChatGenerationSettingsVisible(false)}
      />
      {session && (
        <RenameModal
          visible={renameModalVisible}
          onClose={() => setRenameModalVisible(false)}
          session={session}
        />
      )}
    </View>
  );
});
