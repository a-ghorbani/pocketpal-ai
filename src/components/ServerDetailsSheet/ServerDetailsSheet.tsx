import React, {
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {View, Alert} from 'react-native';
import {
  Text,
  Button,
  TextInput as PaperTextInput,
  ActivityIndicator,
  Icon,
} from 'react-native-paper';
import {observer} from 'mobx-react';
import debounce from 'lodash/debounce';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {serverStore} from '../../store';
import {L10nContext} from '../../utils';
import {testConnection} from '../../api/openai';
import {t} from '../../locales';

import {createStyles} from './styles';
import {EyeIcon, EyeOffIcon} from '../../assets/icons';

interface ServerDetailsSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
  serverId: string | null;
}

export const ServerDetailsSheet: React.FC<ServerDetailsSheetProps> = observer(
  ({isVisible, onDismiss, serverId}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);

    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [secureTextEntry, setSecureTextEntry] = useState(true);
    const [isProbing, setIsProbing] = useState(false);
    const [probeResult, setProbeResult] = useState<{
      ok: boolean;
      error?: string;
    } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const apiKeyRef = useRef(apiKey);
    useEffect(() => {
      apiKeyRef.current = apiKey;
    }, [apiKey]);

    // Load server data when sheet opens
    useEffect(() => {
      if (isVisible && serverId) {
        const server = serverStore.servers.find(s => s.id === serverId);
        if (server) {
          setUrl(server.url);
        }
        serverStore.getApiKey(serverId).then(key => {
          setApiKey(key || '');
          apiKeyRef.current = key || '';
        });
        setProbeResult(null);
        setSecureTextEntry(true);
        setIsSaving(false);
      }
    }, [isVisible, serverId]);

    const server = serverId
      ? serverStore.servers.find(s => s.id === serverId)
      : null;

    const userModels = serverId
      ? serverStore.getUserSelectedModelsForServer(serverId)
      : [];

    const probeServer = useCallback(async (probeUrl: string) => {
      const trimmedUrl = probeUrl.trim();
      if (!trimmedUrl) {
        return;
      }
      try {
        // Validate URL format — throws on invalid
        const parsed = new URL(trimmedUrl);
        if (!parsed.hostname) {
          throw new Error('No hostname');
        }
      } catch {
        return;
      }
      setIsProbing(true);
      setProbeResult(null);
      try {
        const key = apiKeyRef.current.trim() || undefined;
        const result = await testConnection(trimmedUrl, key);
        setProbeResult({ok: result.ok, error: result.error});
      } catch (error: any) {
        setProbeResult({ok: false, error: error.message});
      } finally {
        setIsProbing(false);
      }
    }, []);

    const debouncedProbe = useMemo(
      () => debounce(probeServer, 800),
      [probeServer],
    );

    // Re-probe on apiKey blur
    const handleApiKeyBlur = useCallback(() => {
      if (url.trim()) {
        debouncedProbe(url);
      }
    }, [url, debouncedProbe]);

    const toggleSecureEntry = () => {
      setSecureTextEntry(!secureTextEntry);
    };

    const handleSave = useCallback(async () => {
      if (!serverId || !server) {
        return;
      }
      setIsSaving(true);
      try {
        serverStore.updateServer(serverId, {
          url: url.trim(),
        });
        if (apiKey.trim()) {
          await serverStore.setApiKey(serverId, apiKey.trim());
        } else {
          await serverStore.removeApiKey(serverId);
        }
        onDismiss();
      } finally {
        setIsSaving(false);
      }
    }, [serverId, server, url, apiKey, onDismiss]);

    const handleRemoveServer = useCallback(() => {
      if (!serverId || !server) {
        return;
      }
      const serverName = server.name;
      const modelCount = userModels.length;
      // Dismiss the sheet first so the native alert can present on the main
      // window — @gorhom/bottom-sheet renders on a separate overlay that can
      // block native alerts on iOS.
      onDismiss();
      setTimeout(() => {
        Alert.alert(
          l10n.settings.removeServer,
          t(l10n.settings.removeServerMessage, {
            serverName,
            count: String(modelCount),
          }),
          [
            {text: l10n.common.cancel, style: 'cancel'},
            {
              text: l10n.common.delete,
              style: 'destructive',
              onPress: () => {
                serverStore.removeServer(serverId);
              },
            },
          ],
        );
      }, 300);
    }, [serverId, server, userModels.length, l10n, onDismiss]);

    if (!server) {
      return null;
    }

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onDismiss}
        title={server.name}
        snapPoints={['70%']}>
        <Sheet.ScrollView contentContainerStyle={styles.container}>
          {/* URL Input */}
          <View style={styles.inputSpacing}>
            <TextInput
              testID="server-details-url-input"
              label={l10n.settings.serverUrl}
              defaultValue={url}
              onChangeText={text => {
                setUrl(text);
                debouncedProbe(text);
              }}
              placeholder={l10n.settings.serverUrlPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          {/* Probe status */}
          {isProbing && (
            <View style={styles.probeStatusContainer}>
              <ActivityIndicator size="small" />
              <Text
                style={[
                  styles.probeStatusText,
                  {color: theme.colors.onSurfaceVariant},
                ]}>
                {l10n.settings.connecting}
              </Text>
            </View>
          )}

          {probeResult && !isProbing && (
            <View style={styles.probeStatusContainer}>
              <Icon
                source={
                  probeResult.ok
                    ? 'check-circle-outline'
                    : 'alert-circle-outline'
                }
                size={16}
                color={
                  probeResult.ok ? theme.colors.primary : theme.colors.error
                }
              />
              <Text
                style={[
                  styles.probeStatusText,
                  probeResult.ok
                    ? styles.probeSuccessText
                    : styles.probeErrorText,
                ]}>
                {probeResult.ok
                  ? l10n.settings.connected
                  : t(l10n.settings.connectionFailed, {
                      error: probeResult.error || 'Unknown',
                    })}
              </Text>
            </View>
          )}

          {/* API Key Input */}
          <View style={styles.inputSpacing}>
            <TextInput
              testID="server-details-apikey-input"
              label={l10n.settings.apiKey}
              defaultValue={apiKey}
              onChangeText={setApiKey}
              placeholder={l10n.settings.apiKeyPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              secureTextEntry={secureTextEntry}
              onBlur={handleApiKeyBlur}
              right={
                <PaperTextInput.Icon
                  testID="server-details-apikey-toggle"
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

          {/* Models using this server */}
          {userModels.length > 0 && (
            <View style={styles.modelsSection}>
              <Text style={styles.modelsSectionLabel}>
                {l10n.settings.modelsUsingServer}
              </Text>
              {userModels.map(m => (
                <View key={m.remoteModelId} style={styles.modelItem}>
                  <View style={styles.modelDot} />
                  <Text style={styles.modelItemText}>{m.remoteModelId}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Remove Server */}
          <View style={styles.removeSection}>
            <Button
              testID="remove-server-button"
              mode="text"
              textColor={theme.colors.error}
              onPress={handleRemoveServer}>
              {l10n.settings.removeServer}
            </Button>
            {userModels.length > 0 && (
              <Text style={styles.removeDescription}>
                {t(l10n.settings.removeServerMessage, {
                  serverName: server.name,
                  count: String(userModels.length),
                })}
              </Text>
            )}
          </View>
        </Sheet.ScrollView>
        <Sheet.Actions>
          <View style={styles.buttonsContainer}>
            <Button
              testID="save-server-button"
              mode="contained"
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
              style={styles.saveButton}>
              {l10n.settings.saveChanges}
            </Button>
          </View>
        </Sheet.Actions>
      </Sheet>
    );
  },
);
