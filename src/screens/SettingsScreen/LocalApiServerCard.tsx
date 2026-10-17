import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import Clipboard from '@react-native-clipboard/clipboard';
import {observer} from 'mobx-react-lite';
import {
  ActivityIndicator,
  Button,
  Card,
  Switch,
  Text,
} from 'react-native-paper';

import {Dialog, Divider, TextInput} from '../../components';
import {useTheme} from '../../hooks';
import {t} from '../../locales';
import type {Translations} from '../../locales/types';
import {
  LocalApiServerError,
  localApiServerStore,
  modelStore,
} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

const ERROR_COPY: Record<
  LocalApiServerError,
  keyof Translations['settings']['localApiServer']['errors']
> = {
  port_in_use: 'portInUse',
  listen_failed: 'listenFailed',
  stopped_listening: 'stoppedListening',
  key_unavailable: 'keyUnavailable',
};

export const LocalApiServerCard: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const copy = l10n.settings.localApiServer;
  const store = localApiServerStore;

  const [portDraft, setPortDraft] = useState(String(store.port));
  const [portInvalid, setPortInvalid] = useState(false);
  const [keyDialogVisible, setKeyDialogVisible] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  useEffect(() => {
    setPortDraft(String(store.port));
  }, [store.port]);

  const editable = store.status === 'stopped';
  const servedModel = store.servedModelId ? modelStore.activeModel : undefined;

  const commitPort = () => setPortInvalid(!store.setPort(Number(portDraft)));

  const saveKey = async () => {
    if (await store.setApiKey(keyDraft)) {
      setKeyDraft('');
      setKeyDialogVisible(false);
    }
  };

  const closeKeyDialog = () => {
    setKeyDraft('');
    setKeyDialogVisible(false);
  };

  return (
    <Card elevation={0} style={styles.card} testID="local-api-server-card">
      <Card.Title title={copy.title} />
      <Card.Content>
        <View style={styles.settingItemContainer}>
          <View style={styles.switchContainer}>
            <View style={styles.textContainer}>
              <Text variant="titleMedium" style={styles.textLabel}>
                {copy.enable}
              </Text>
              <Text variant="labelSmall" style={styles.textDescription}>
                {copy.enableDescription}
              </Text>
            </View>
            <Switch
              testID="local-api-server-switch"
              value={store.enabled}
              onValueChange={value => store.setEnabled(value)}
            />
          </View>

          {store.status === 'starting' && (
            <View style={styles.switchContainer}>
              <Text variant="bodyMedium">{copy.starting}</Text>
              <ActivityIndicator size="small" />
            </View>
          )}

          {store.status === 'running' && store.baseUrl && (
            <View style={styles.textContainer}>
              <Text variant="labelSmall" style={styles.textDescription}>
                {copy.url}
              </Text>
              <View style={styles.switchContainer}>
                <Text
                  variant="titleMedium"
                  selectable
                  testID="local-api-server-url"
                  style={styles.textLabel}>
                  {store.baseUrl}
                </Text>
                <Button
                  mode="text"
                  compact
                  onPress={() => Clipboard.setString(store.baseUrl ?? '')}>
                  {copy.copyUrl}
                </Button>
              </View>
              <Text variant="bodyMedium" style={styles.textDescription}>
                {servedModel
                  ? t(copy.servedModel, {model: servedModel.name})
                  : copy.noModel}
              </Text>
              {store.lanEnabled && !store.lanAddress && (
                <Text variant="labelSmall" style={styles.textDescription}>
                  {copy.notOnWifi}
                </Text>
              )}
            </View>
          )}

          {store.status === 'failed' && store.lastError && (
            <Text
              variant="bodyMedium"
              style={styles.errorText}
              testID="local-api-server-error">
              {t(copy.errors[ERROR_COPY[store.lastError]], {port: store.port})}
            </Text>
          )}

          <Divider />

          {!editable && (
            <Text variant="labelSmall" style={styles.textDescription}>
              {copy.stopToEdit}
            </Text>
          )}

          <TextInput
            testID="local-api-server-port-input"
            label={copy.port}
            value={portDraft}
            onChangeText={setPortDraft}
            onBlur={commitPort}
            keyboardType="number-pad"
            editable={editable}
            disabled={!editable}
            error={portInvalid}
            helperText={portInvalid ? copy.portInvalid : undefined}
          />

          <View style={styles.switchContainer}>
            <View style={styles.textContainer}>
              <Text variant="titleMedium" style={styles.textLabel}>
                {copy.lan}
              </Text>
              {store.lanEnabled && (
                <Text variant="labelSmall" style={styles.textDescription}>
                  {copy.lanWarning}
                </Text>
              )}
            </View>
            <Switch
              testID="local-api-server-lan-switch"
              value={store.lanEnabled}
              disabled={!editable}
              onValueChange={value => {
                store.setLanEnabled(value);
              }}
            />
          </View>

          <View style={styles.switchContainer}>
            <View style={styles.textContainer}>
              <Text variant="titleMedium" style={styles.textLabel}>
                {copy.apiKey}
              </Text>
              <Text variant="labelSmall" style={styles.textDescription}>
                {store.hasApiKey ? copy.apiKeySet : copy.apiKeyNotSet}
              </Text>
            </View>
            <Button
              testID="local-api-server-key-button"
              mode="outlined"
              disabled={!editable}
              onPress={() =>
                store.hasApiKey
                  ? store.clearApiKey()
                  : setKeyDialogVisible(true)
              }>
              {store.hasApiKey ? copy.clearApiKey : copy.setApiKey}
            </Button>
          </View>
        </View>
      </Card.Content>

      <Dialog
        testID="local-api-server-key-dialog"
        visible={keyDialogVisible}
        onDismiss={closeKeyDialog}
        title={copy.apiKey}
        avoidKeyboard
        actions={[
          {label: l10n.common.cancel, onPress: closeKeyDialog},
          {
            label: l10n.common.save,
            onPress: saveKey,
            mode: 'contained',
            disabled: keyDraft.length === 0,
            testID: 'local-api-server-key-save',
          },
        ]}>
        <TextInput
          testID="local-api-server-key-input"
          value={keyDraft}
          onChangeText={setKeyDraft}
          placeholder={copy.apiKeyPlaceholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Dialog>
    </Card>
  );
});
