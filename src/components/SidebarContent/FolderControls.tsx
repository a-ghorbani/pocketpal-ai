import React, {useContext, useState} from 'react';
import {ScrollView, TouchableOpacity, View} from 'react-native';
import {Button, IconButton, Text} from 'react-native-paper';
import {observer} from 'mobx-react';
import {chatSessionStore} from '../../store';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {createStyles} from './styles';

export const FolderControls = observer(
  ({
    onCreate,
    onFolderMenu,
  }: {
    onCreate: () => void;
    onFolderMenu: (folder: {id: string; name: string}, event: any) => void;
  }) => {
    const labels = useContext(L10nContext).components.sidebarContent.folders;
    const styles = createStyles(useTheme());
    const [expanded, setExpanded] = useState(true);
    const store = chatSessionStore;
    const unfiled = store.sessions.filter(
      s => !store.folders.some(f => f.id === s.folderId),
    ).length;
    return (
      <View>
        <View style={styles.filterRow}>
          {[
            [null, labels.allChats, store.sessions.length],
            ['unfiled', labels.unfiled, unfiled],
          ].map(([id, label, count]) => (
            <Button
              key={String(id)}
              compact
              mode={store.folderFilter === id ? 'contained-tonal' : 'text'}
              onPress={() => store.setFolderFilter(id as string | null)}
              accessibilityState={{selected: store.folderFilter === id}}
              testID={id === null ? 'filter-all' : 'filter-unfiled'}>
              {`${label} ${count}`}
            </Button>
          ))}
        </View>
        <View style={styles.folderHeader}>
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            accessibilityRole="button"
            accessibilityLabel={labels.title}
            accessibilityState={{expanded}}
            style={styles.folderHeading}
            testID="toggle-folders">
            <Text variant="labelLarge">{labels.title}</Text>
            <IconButton
              icon={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              pointerEvents="none"
              accessible={false}
              style={styles.inlineIcon}
            />
          </TouchableOpacity>
          <IconButton
            icon="folder-plus-outline"
            size={22}
            onPress={onCreate}
            accessibilityLabel={labels.newFolder}
            testID="new-folder-button"
          />
        </View>
        {expanded && (
          <ScrollView
            style={styles.folderList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled">
            {store.folders.map(folder => {
              const selected = store.folderFilter === folder.id;
              const count = store.sessions.filter(
                s => s.folderId === folder.id,
              ).length;
              return (
                <View
                  key={folder.id}
                  style={[styles.folderRow, selected && styles.activeRow]}>
                  <TouchableOpacity
                    onPress={() => store.setFolderFilter(folder.id)}
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    accessibilityLabel={t(labels.folderCount, {
                      name: folder.name,
                      count: String(count),
                    })}
                    style={styles.folderTouchable}
                    testID={`filter-folder-${folder.id}`}>
                    <Text style={styles.folderTitle} numberOfLines={2}>
                      {folder.name}
                    </Text>
                    <Text variant="labelMedium" style={styles.secondaryText}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                  <IconButton
                    icon="dots-horizontal"
                    size={20}
                    accessibilityLabel={t(labels.folderActions, {
                      name: folder.name,
                    })}
                    onPress={event => onFolderMenu(folder, event)}
                    testID={`folder-actions-${folder.id}`}
                  />
                </View>
              );
            })}
            {store.folders.length === 0 && (
              <Button onPress={onCreate} style={styles.emptyFolderButton}>
                {labels.createFirst}
              </Button>
            )}
          </ScrollView>
        )}
        {!expanded && store.newSessionFolderId && (
          <Text style={styles.filterContext} numberOfLines={2}>
            {store.folders.find(f => f.id === store.folderFilter)?.name}
          </Text>
        )}
      </View>
    );
  },
);
