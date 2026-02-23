import React, {useState, useContext, useEffect} from 'react';
import {View} from 'react-native';
import {
  Text,
  Button,
  TextInput as PaperTextInput,
} from 'react-native-paper';
import {observer} from 'mobx-react';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {serverStore} from '../../store';
import {L10nContext} from '../../utils';
import {ServerConfig} from '../../utils/types';
import {t} from '../../locales';

import {createStyles} from './styles';
import {EyeIcon, EyeOffIcon} from '../../assets/icons';

interface ServerConfigSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
  server?: ServerConfig; // If provided, edit mode
}

/**
 * Returns true if the host is a local/LAN address.
 */
function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

export const ServerConfigSheet: React.FC<ServerConfigSheetProps> = observer(
  ({isVisible, onDismiss, server}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);

    const [name, setName] = useState(server?.name || '');
    const [url, setUrl] = useState(server?.url || '');
    const [apiKey, setApiKey] = useState('');
    const [secureTextEntry, setSecureTextEntry] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [testResult, setTestResult] = useState<{
      ok: boolean;
      modelCount: number;
      error?: string;
    } | null>(null);
    const [nameError, setNameError] = useState('');
    const [urlError, setUrlError] = useState('');

    const isEditMode = !!server;

    // Load API key when editing
    useEffect(() => {
      if (server && isVisible) {
        setName(server.name);
        setUrl(server.url);
        setTestResult(null);
        setNameError('');
        setUrlError('');
        // Load API key from keychain
        serverStore.getApiKey(server.id).then(key => {
          if (key) {
            setApiKey(key);
          }
        });
      } else if (!server && isVisible) {
        setName('');
        setUrl('');
        setApiKey('');
        setTestResult(null);
        setNameError('');
        setUrlError('');
      }
    }, [server, isVisible]);

    const showHttpWarning =
      url.startsWith('http://') && url.length > 7 && !isLocalHost(url);

    const validate = (): boolean => {
      let valid = true;
      if (!name.trim()) {
        setNameError(l10n.settings.serverNameRequired);
        valid = false;
      } else {
        setNameError('');
      }
      if (!url.trim()) {
        setUrlError(l10n.settings.serverUrlRequired);
        valid = false;
      } else {
        try {
          new URL(url);
          setUrlError('');
        } catch {
          setUrlError(l10n.settings.serverUrlInvalid);
          valid = false;
        }
      }
      return valid;
    };

    const handleSave = async () => {
      if (!validate()) {
        return;
      }

      setIsSaving(true);
      try {
        if (isEditMode && server) {
          serverStore.updateServer(server.id, {
            name: name.trim(),
            url: url.trim(),
          });
          if (apiKey.trim()) {
            await serverStore.setApiKey(server.id, apiKey.trim());
          }
        } else {
          // Show privacy notice for first server if not acknowledged
          const serverId = serverStore.addServer({
            name: name.trim(),
            url: url.trim(),
            isActive: true,
          });
          if (apiKey.trim()) {
            await serverStore.setApiKey(serverId, apiKey.trim());
          }
        }
        onDismiss();
      } finally {
        setIsSaving(false);
      }
    };

    const handleTestConnection = async () => {
      if (!url.trim()) {
        setUrlError(l10n.settings.serverUrlRequired);
        return;
      }

      setIsTesting(true);
      setTestResult(null);

      try {
        // Create a temporary server config for testing
        const tempServerId = server?.id || `temp-${Date.now()}`;
        if (!server) {
          // For new servers, use the openai client directly
          const {testConnection} = await import('../../api/openai');
          const result = await testConnection(url.trim(), apiKey.trim() || undefined);
          setTestResult(result);
        } else {
          const result = await serverStore.testServerConnection(server.id);
          setTestResult(result);
        }
      } catch (error: any) {
        setTestResult({ok: false, modelCount: 0, error: error.message});
      } finally {
        setIsTesting(false);
      }
    };

    const toggleSecureEntry = () => {
      setSecureTextEntry(!secureTextEntry);
    };

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onDismiss}
        title={
          isEditMode
            ? l10n.settings.editServer
            : l10n.settings.addServer
        }
        snapPoints={['70%']}>
        <Sheet.ScrollView contentContainerStyle={styles.container}>
          {!serverStore.privacyNoticeAcknowledged && !isEditMode && (
            <View style={styles.privacyContainer}>
              <Text style={styles.privacyText}>
                {l10n.settings.remotePrivacyNotice}
              </Text>
            </View>
          )}

          <View style={styles.inputSpacing}>
            <TextInput
              testID="server-name-input"
              label={l10n.settings.serverName}
              defaultValue={name}
              onChangeText={text => {
                setName(text);
                if (nameError) {
                  setNameError('');
                }
              }}
              placeholder={l10n.settings.serverNamePlaceholder}
              autoCapitalize="none"
              error={!!nameError}
            />
            {nameError ? (
              <Text style={{color: theme.colors.error, fontSize: 12, marginTop: 4}}>
                {nameError}
              </Text>
            ) : null}
          </View>

          <View style={styles.inputSpacing}>
            <TextInput
              testID="server-url-input"
              label={l10n.settings.serverUrl}
              defaultValue={url}
              onChangeText={text => {
                setUrl(text);
                if (urlError) {
                  setUrlError('');
                }
              }}
              placeholder={l10n.settings.serverUrlPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              error={!!urlError}
            />
            {urlError ? (
              <Text style={{color: theme.colors.error, fontSize: 12, marginTop: 4}}>
                {urlError}
              </Text>
            ) : null}
          </View>

          {showHttpWarning && (
            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>
                {l10n.settings.serverUrlHttpWarning}
              </Text>
            </View>
          )}

          <View style={styles.inputSpacing}>
            <TextInput
              testID="server-apikey-input"
              label={l10n.settings.apiKey}
              defaultValue={apiKey}
              onChangeText={setApiKey}
              placeholder={l10n.settings.apiKeyPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              secureTextEntry={secureTextEntry}
              right={
                <PaperTextInput.Icon
                  testID="server-apikey-toggle"
                  icon={({color}) =>
                    secureTextEntry ? (
                      <EyeIcon width={24} height={24} stroke={color} />
                    ) : (
                      <EyeOffIcon width={24} height={24} stroke={color} />
                    )
                  }
                  onPress={toggleSecureEntry}
                />
              }
            />
            <Text style={styles.apiKeyDescription}>
              {l10n.settings.apiKeyDescription}
            </Text>
          </View>

          {testResult && (
            <View
              style={[
                styles.testResultContainer,
                testResult.ok ? styles.testSuccess : styles.testFailure,
              ]}>
              <Text
                style={[
                  styles.testResultText,
                  testResult.ok
                    ? styles.testSuccessText
                    : styles.testFailureText,
                ]}>
                {testResult.ok
                  ? t(l10n.settings.testConnectionSuccess, {
                      modelCount: String(testResult.modelCount),
                    })
                  : t(l10n.settings.testConnectionFailed, {
                      error: testResult.error || 'Unknown error',
                    })}
              </Text>
            </View>
          )}
        </Sheet.ScrollView>
        <Sheet.Actions>
          <View style={styles.buttonsContainer}>
            <Button
              testID="server-test-button"
              mode="outlined"
              onPress={handleTestConnection}
              loading={isTesting}
              disabled={isTesting || isSaving || !url.trim()}
              style={styles.testButton}>
              {isTesting
                ? l10n.settings.testing
                : l10n.settings.testConnection}
            </Button>
            <Button
              testID="server-save-button"
              mode="contained"
              onPress={handleSave}
              loading={isSaving}
              disabled={isTesting || isSaving}
              style={styles.saveButton}>
              {l10n.common.save}
            </Button>
          </View>
        </Sheet.Actions>
      </Sheet>
    );
  },
);
