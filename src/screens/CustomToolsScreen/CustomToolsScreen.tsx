import React, {useContext, useState} from 'react';
import {Alert, Platform, ScrollView, View} from 'react-native';

import {observer} from 'mobx-react';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, Card, Text} from 'react-native-paper';
import {pick, types} from '@react-native-documents/picker';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Clipboard from '@react-native-clipboard/clipboard';

import {CustomToolSheet} from '../../components';
import {useTheme} from '../../hooks';
import {customToolStore} from '../../store';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {isNonLoopback, toolStatus} from '../../services/customTools/toolStatus';
import type {CustomToolDefinition} from '../../services/customTools/types';

import {createStyles} from './styles';

/** Scheme + host + port, for the one-line endpoint summary. */
const originOf = (url: string): string => {
  const scheme = /^https?:\/\//i.exec(url);
  if (!scheme) {
    return url;
  }
  const afterScheme = url.slice(scheme[0].length);
  const pathStart = afterScheme.search(/[/?#]/);
  return pathStart === -1 ? afterScheme : afterScheme.slice(0, pathStart);
};

export const CustomToolsScreen: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);
  const strings = l10n.customToolsScreen;

  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [editing, setEditing] = useState<CustomToolDefinition | undefined>();
  const [notice, setNotice] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(undefined);
    setIsSheetVisible(true);
  };

  const openEdit = (tool: CustomToolDefinition) => {
    setEditing(tool);
    setIsSheetVisible(true);
  };

  const handleExport = () => {
    const file = customToolStore.exportTools();
    if (file.tools.length === 0) {
      setNotice(strings.exportEmpty);
      return;
    }
    Clipboard.setString(JSON.stringify(file, null, 2));
    setNotice(t(strings.exported, {count: file.tools.length}));
  };

  const handleImport = async () => {
    setNotice(null);
    try {
      const picked = await pick({
        type: Platform.OS === 'ios' ? 'public.json' : types.allFiles,
      });
      const [file] = Array.isArray(picked) ? picked : [picked];
      if (!file?.uri) {
        return;
      }
      const raw = await RNFS.readFile(file.uri, 'utf8');
      const report = customToolStore.importTools(JSON.parse(raw));
      const messages = [t(strings.imported, {count: report.imported.length})];
      if (report.rejected.length > 0) {
        messages.push(
          t(strings.importRejected, {count: report.rejected.length}),
        );
      }
      setNotice(messages.join(' '));
    } catch {
      setNotice(strings.importFailed);
    }
  };

  const confirmDelete = (tool: CustomToolDefinition) => {
    Alert.alert(
      t(strings.deleteConfirmTitle, {name: tool.name}),
      strings.deleteConfirmMessage,
      [
        {text: strings.cancel, style: 'cancel'},
        {
          text: strings.delete,
          style: 'destructive',
          onPress: () => {
            customToolStore.removeTool(tool.id);
          },
        },
      ],
    );
  };

  const badgesFor = (tool: CustomToolDefinition) => {
    const status = toolStatus(tool, customToolStore.tools);
    const badges: Array<{key: string; label: string; warning: boolean}> = [];
    if (status.kind === 'name_conflict') {
      badges.push({
        key: 'name-conflict',
        label: strings.badgeNameConflict,
        warning: true,
      });
    }
    if (status.kind === 'invalid') {
      badges.push({key: 'invalid', label: strings.badgeInvalid, warning: true});
    }
    if (isNonLoopback(tool)) {
      badges.push({
        key: 'non-loopback',
        label: strings.badgeNonLoopback,
        warning: true,
      });
    }
    if (!tool.requiresConfirmation) {
      badges.push({
        key: 'no-confirmation',
        label: strings.badgeNoConfirmation,
        warning: false,
      });
    }
    return badges;
  };

  return (
    <SafeAreaView style={styles.root} testID="custom-tools-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.actions}>
          <Button
            testID="custom-tools-create"
            mode="contained"
            onPress={openCreate}>
            {strings.create}
          </Button>
          <Button testID="custom-tools-import" onPress={handleImport}>
            {strings.import}
          </Button>
          <Button testID="custom-tools-export" onPress={handleExport}>
            {strings.export}
          </Button>
        </View>

        {notice && (
          <Text style={styles.notice} testID="custom-tools-notice">
            {notice}
          </Text>
        )}

        {customToolStore.tools.length === 0 ? (
          <View style={styles.empty} testID="custom-tools-empty">
            <Text>{strings.empty}</Text>
            <Text style={styles.emptyHint}>{strings.emptyHint}</Text>
          </View>
        ) : (
          customToolStore.tools.map(tool => (
            <Card
              key={tool.id}
              elevation={0}
              style={styles.card}
              testID={`custom-tool-row-${tool.id}`}>
              <Card.Content>
                <View style={styles.cardRow}>
                  <View>
                    <Text variant="bodyMedium">{tool.name}</Text>
                    <Text style={styles.endpoint}>
                      {`${tool.request.method} ${originOf(tool.request.url)}`}
                    </Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Button
                      testID={`custom-tool-edit-${tool.id}`}
                      mode="text"
                      onPress={() => openEdit(tool)}>
                      {strings.edit}
                    </Button>
                    <Button
                      testID={`custom-tool-delete-${tool.id}`}
                      mode="text"
                      onPress={() => confirmDelete(tool)}>
                      {strings.delete}
                    </Button>
                  </View>
                </View>

                <View style={styles.badges}>
                  {badgesFor(tool).map(badge => (
                    <Text
                      key={badge.key}
                      testID={`custom-tool-badge-${badge.key}-${tool.id}`}
                      style={[
                        styles.badge,
                        badge.warning && styles.badgeWarning,
                      ]}>
                      {badge.label}
                    </Text>
                  ))}
                </View>
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>

      <CustomToolSheet
        isVisible={isSheetVisible}
        tool={editing}
        onClose={() => setIsSheetVisible(false)}
      />
    </SafeAreaView>
  );
});
