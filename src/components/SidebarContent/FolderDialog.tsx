import React, {useContext, useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import {Button, HelperText, List, Text, TextInput} from 'react-native-paper';
import {observer} from 'mobx-react';
import {chatSessionStore} from '../../store';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {FOLDER_NAME_LIMIT} from '../../repositories/ChatFolderRepository';
import {createStyles} from './styles';

export interface FolderDialogState {
  mode: 'create' | 'rename' | 'move';
  folder?: {id: string; name: string};
  sessionIds?: string[];
}

export const FolderDialog = observer(
  ({
    state,
    onClose,
    onMoved,
  }: {
    state: FolderDialogState;
    onClose: () => void;
    onMoved: (folderId: string | null) => void;
  }) => {
    const l10n = useContext(L10nContext);
    const labels = l10n.components.sidebarContent.folders;
    const styles = createStyles(useTheme());
    const [creating, setCreating] = useState(state.mode === 'create');
    const [name, setName] = useState(state.folder?.name || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const saving = React.useRef(false);
    const isForm = creating || state.mode === 'rename';
    const close = () => {
      if (!saving.current) {
        onClose();
      }
    };

    const apply = async (folderId?: string | null) => {
      if (saving.current) {
        return;
      }
      saving.current = true;
      setBusy(true);
      setError('');
      try {
        if (creating) {
          const folder = await chatSessionStore.createFolder(
            name,
            state.sessionIds || [],
          );
          if (state.mode === 'move') {
            onMoved(folder.id);
          } else {
            chatSessionStore.setFolderFilter(folder.id);
          }
        } else if (state.mode === 'rename' && state.folder) {
          await chatSessionStore.renameFolder(state.folder.id, name);
        } else {
          await chatSessionStore.moveSessionsToFolder(
            state.sessionIds || [],
            folderId || null,
          );
          onMoved(folderId || null);
        }
        onClose();
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        setError(
          code === 'duplicateFolderName'
            ? labels.duplicateName
            : code === 'invalidFolderName'
              ? labels.invalidName
              : labels.saveError,
        );
      } finally {
        saving.current = false;
        setBusy(false);
      }
    };

    return (
      <Modal transparent animationType="fade" visible onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.dialogOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.dialogContent} accessibilityViewIsModal>
            <Text variant="titleLarge" accessibilityRole="header">
              {creating
                ? labels.newFolder
                : state.mode === 'rename'
                  ? labels.renameFolder
                  : labels.moveToFolder}
            </Text>
            {isForm ? (
              <TextInput
                mode="outlined"
                label={labels.folderName}
                accessibilityLabel={labels.folderName}
                testID="folder-name-input"
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={FOLDER_NAME_LIMIT}
                disabled={busy}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (name.trim()) {
                    apply();
                  }
                }}
                style={styles.folderNameInput}
                error={!!error}
              />
            ) : (
              <ScrollView
                style={styles.moveList}
                keyboardShouldPersistTaps="handled">
                <List.Item
                  title={labels.unfiled}
                  onPress={() => apply(null)}
                  disabled={busy}
                  testID="move-unfiled"
                  accessibilityRole="button"
                />
                {chatSessionStore.folders.map(folder => (
                  <List.Item
                    key={folder.id}
                    title={folder.name}
                    titleNumberOfLines={3}
                    onPress={() => apply(folder.id)}
                    disabled={busy}
                    testID={`move-folder-${folder.id}`}
                    accessibilityRole="button"
                  />
                ))}
                <Button
                  icon="plus"
                  onPress={() => {
                    setCreating(true);
                    setError('');
                  }}
                  disabled={busy}
                  accessibilityLabel={labels.newFolder}
                  testID="create-folder-while-moving">
                  {labels.newFolder}
                </Button>
              </ScrollView>
            )}
            {!!error && (
              <HelperText type="error" accessibilityRole="alert">
                {error}
              </HelperText>
            )}
            <View style={styles.dialogActions}>
              <Button onPress={close} disabled={busy}>
                {l10n.common.cancel}
              </Button>
              {isForm && (
                <Button
                  mode="contained"
                  onPress={() => apply()}
                  disabled={busy || !name.trim()}
                  loading={busy}
                  testID="save-folder-button">
                  {state.mode === 'move'
                    ? labels.createAndMove
                    : l10n.common.save}
                </Button>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  },
);
