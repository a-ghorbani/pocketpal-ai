import React, {useState, useContext, useEffect, useCallback, useMemo, useRef} from 'react';
import {View} from 'react-native';
import {
  Text,
  Button,
  TextInput as PaperTextInput,
  Chip,
  RadioButton,
  ActivityIndicator,
  Icon,
} from 'react-native-paper';
import {observer} from 'mobx-react';
import {runInAction} from 'mobx';
import debounce from 'lodash/debounce';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {serverStore} from '../../store';
import {L10nContext} from '../../utils';
import {isLocalHost} from '../../utils/network';
import {ServerConfig} from '../../utils/types';
import {RemoteModelInfo, testConnection, fetchModels} from '../../api/openai';
import {t} from '../../locales';

import {createStyles} from './styles';
import {EyeIcon, EyeOffIcon} from '../../assets/icons';

interface RemoteModelSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
  onModelAdded?: () => void;
}

/**
 * Smart server name from URL: detect common ports.
 */
function guessServerName(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const port = parsed.port;
    if (port === '1234') {
      return 'LM Studio';
    }
    if (port === '11434') {
      return 'Ollama';
    }
    if (port === '8080') {
      return 'llama.cpp';
    }
    return parsed.hostname;
  } catch {
    return '';
  }
}

export const RemoteModelSheet: React.FC<RemoteModelSheetProps> = observer(
  ({isVisible, onDismiss, onModelAdded}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);

    // Connection
    const [url, setUrl] = useState('');
    const [serverName, setServerName] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [secureTextEntry, setSecureTextEntry] = useState(true);

    // Auto-probe
    const [isProbing, setIsProbing] = useState(false);
    const [probeResult, setProbeResult] = useState<{
      ok: boolean;
      error?: string;
    } | null>(null);

    // Available models
    const [availableModels, setAvailableModels] = useState<RemoteModelInfo[]>(
      [],
    );
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

    // Known server selection
    const [selectedServerId, setSelectedServerId] = useState<string | null>(
      null,
    );

    // Saving
    const [isSaving, setIsSaving] = useState(false);

    // Errors
    const [urlError, setUrlError] = useState('');

    // Keep apiKey in a ref so debounced function reads current value
    const apiKeyRef = useRef(apiKey);
    useEffect(() => {
      apiKeyRef.current = apiKey;
    }, [apiKey]);

    // Reset all state when sheet reopens
    useEffect(() => {
      if (isVisible) {
        setUrl('');
        setServerName('');
        setApiKey('');
        setSecureTextEntry(true);
        setIsProbing(false);
        setProbeResult(null);
        setAvailableModels([]);
        setSelectedModelId(null);
        setSelectedServerId(null);
        setIsSaving(false);
        setUrlError('');
      }
    }, [isVisible]);

    const probeServer = useCallback(
      async (probeUrl: string) => {
        const trimmedUrl = probeUrl.trim();
        if (!trimmedUrl) {
          return;
        }
        try {
          new URL(trimmedUrl);
        } catch {
          setUrlError(l10n.settings.serverUrlInvalid);
          return;
        }
        setUrlError('');
        setIsProbing(true);
        setProbeResult(null);
        try {
          const key = apiKeyRef.current.trim() || undefined;
          const result = await testConnection(trimmedUrl, key);
          setProbeResult({ok: result.ok, error: result.error});
          if (result.ok) {
            setServerName(prev => prev || guessServerName(trimmedUrl));
            const models = await fetchModels(trimmedUrl, key);
            setAvailableModels(models);
            if (models.length === 1) {
              setSelectedModelId(models[0].id);
            }
          }
        } catch (error: any) {
          setProbeResult({ok: false, error: error.message});
        } finally {
          setIsProbing(false);
        }
      },
      [l10n],
    );

    const debouncedProbe = useMemo(
      () => debounce(probeServer, 800),
      [probeServer],
    );

    // Trigger probe on url change (only when not using a known server chip)
    useEffect(() => {
      if (!selectedServerId) {
        debouncedProbe(url);
      }
      return () => {
        debouncedProbe.cancel();
      };
    }, [url, debouncedProbe, selectedServerId]);

    // Re-probe on apiKey blur
    const handleApiKeyBlur = useCallback(() => {
      if (url.trim() && !selectedServerId) {
        debouncedProbe(url);
      }
    }, [url, debouncedProbe, selectedServerId]);

    const showHttpWarning =
      url.startsWith('http://') && url.length > 7 && !isLocalHost(url);

    const toggleSecureEntry = () => {
      setSecureTextEntry(!secureTextEntry);
    };

    // Check if a model is already added for the given server
    const isModelAlreadyAdded = useCallback(
      (servId: string, modelId: string) => {
        return serverStore.userSelectedModels.some(
          m => m.serverId === servId && m.remoteModelId === modelId,
        );
      },
      [],
    );

    // Known server chip press
    const handleServerChipPress = useCallback(
      async (server: ServerConfig) => {
        setSelectedServerId(server.id);
        setServerName(server.name);
        setUrl(server.url);
        setIsProbing(true);
        setProbeResult(null);
        setAvailableModels([]);
        setSelectedModelId(null);
        setUrlError('');
        try {
          const key = await serverStore.getApiKey(server.id);
          apiKeyRef.current = key || '';
          setApiKey(key || '');
          const models = await fetchModels(server.url, key || undefined);
          runInAction(() => {
            serverStore.serverModels.set(server.id, models);
          });
          const notYetAdded = serverStore.getModelsNotYetAdded(server.id);
          setAvailableModels(models);
          if (notYetAdded.length === 1) {
            setSelectedModelId(notYetAdded[0].id);
          }
          setProbeResult({ok: true});
        } catch (error: any) {
          setProbeResult({ok: false, error: error.message});
        } finally {
          setIsProbing(false);
        }
      },
      [],
    );

    const handleDeselectChip = useCallback(() => {
      setSelectedServerId(null);
      setUrl('');
      setServerName('');
      setApiKey('');
      apiKeyRef.current = '';
      setProbeResult(null);
      setAvailableModels([]);
      setSelectedModelId(null);
      setUrlError('');
    }, []);

    // Save / add model
    const handleAddModel = useCallback(async () => {
      if (!selectedModelId) {
        return;
      }
      setIsSaving(true);
      try {
        let serverId = selectedServerId;
        if (!serverId) {
          // Create new server
          serverId = serverStore.addServer({
            name: serverName.trim(),
            url: url.trim(),
          });
          if (apiKey.trim()) {
            await serverStore.setApiKey(serverId, apiKey.trim());
          }
        }
        // Acknowledge privacy notice
        if (!serverStore.privacyNoticeAcknowledged) {
          serverStore.acknowledgePrivacyNotice();
        }
        // Add model to user selections
        serverStore.addUserSelectedModel(serverId, selectedModelId);
        // Fetch models for this server so serverModels is populated
        await serverStore.fetchModelsForServer(serverId);
        onModelAdded?.();
        onDismiss();
      } finally {
        setIsSaving(false);
      }
    }, [
      selectedModelId,
      selectedServerId,
      serverName,
      url,
      apiKey,
      onModelAdded,
      onDismiss,
    ]);

    const selectedServer = selectedServerId
      ? serverStore.servers.find(s => s.id === selectedServerId)
      : null;

    const showPostConnection = probeResult?.ok === true;

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onDismiss}
        title={l10n.settings.addRemoteModel}
        snapPoints={['80%']}>
        <Sheet.ScrollView contentContainerStyle={styles.container}>
          {/* Privacy Notice */}
          {!serverStore.privacyNoticeAcknowledged && (
            <View style={styles.privacyContainer}>
              <Text style={styles.privacyText}>
                {l10n.settings.remotePrivacyNotice}
              </Text>
            </View>
          )}

          {/* Known Server Chips */}
          {serverStore.servers.length > 0 && (
            <View style={styles.chipsSection}>
              <Text style={styles.chipsSectionLabel}>
                {l10n.settings.yourServers}
              </Text>
              <View style={styles.chipsRow}>
                {serverStore.servers.map(server => (
                  <Chip
                    key={server.id}
                    testID={`server-chip-${server.id}`}
                    selected={selectedServerId === server.id}
                    onPress={() => {
                      if (selectedServerId === server.id) {
                        handleDeselectChip();
                      } else {
                        handleServerChipPress(server);
                      }
                    }}>
                    {server.name}
                  </Chip>
                ))}
              </View>

              {/* Divider */}
              {!selectedServerId && (
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>
                    {l10n.settings.orConnectNewServer}
                  </Text>
                  <View style={styles.dividerLine} />
                </View>
              )}
            </View>
          )}

          {/* Chip server info when selected */}
          {selectedServer && probeResult?.ok && (
            <View style={styles.chipServerInfo}>
              <Text style={styles.chipServerName}>{selectedServer.name}</Text>
              <Text style={styles.chipServerUrl}>{selectedServer.url}</Text>
            </View>
          )}

          {/* Chip offline error */}
          {selectedServerId && probeResult?.ok === false && (
            <View style={styles.chipErrorContainer}>
              <Text style={styles.errorText}>
                {t(l10n.settings.connectionFailed, {
                  error: probeResult.error || 'Unknown',
                })}
              </Text>
              <View style={styles.chipErrorActions}>
                <Button
                  compact
                  mode="text"
                  onPress={() =>
                    selectedServer && handleServerChipPress(selectedServer)
                  }>
                  {l10n.settings.retryConnection}
                </Button>
                <Button compact mode="text" onPress={handleDeselectChip}>
                  {l10n.settings.enterUrlManually}
                </Button>
              </View>
            </View>
          )}

          {/* URL Input - only show when not using a known server chip */}
          {!selectedServerId && (
            <>
              <View style={styles.inputSpacing}>
                <TextInput
                  testID="remote-url-input"
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
                  <Text style={styles.errorText}>{urlError}</Text>
                ) : null}
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
                      probeResult.ok
                        ? theme.colors.primary
                        : theme.colors.error
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

              {/* HTTP Warning */}
              {showHttpWarning && (
                <View style={styles.warningContainer}>
                  <Text style={styles.warningText}>
                    {l10n.settings.serverUrlHttpWarning}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Post-connection fields */}
          {showPostConnection && !selectedServerId && (
            <>
              <View style={styles.inputSpacing}>
                <TextInput
                  testID="remote-name-input"
                  label={l10n.settings.serverName}
                  defaultValue={serverName}
                  onChangeText={setServerName}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputSpacing}>
                <TextInput
                  testID="remote-apikey-input"
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
                      testID="remote-apikey-toggle"
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
            </>
          )}

          {/* Model Selection */}
          {showPostConnection && availableModels.length > 1 && (
            <View style={styles.modelListSection}>
              <Text style={styles.modelListLabel}>
                {l10n.settings.selectModel}
              </Text>
              {availableModels.map(model => {
                const servId = selectedServerId || '';
                const alreadyAdded =
                  !!selectedServerId && isModelAlreadyAdded(servId, model.id);
                return (
                  <View
                    key={model.id}
                    style={[
                      styles.modelRow,
                      alreadyAdded && styles.modelRowDisabled,
                    ]}>
                    <RadioButton
                      value={model.id}
                      status={
                        alreadyAdded
                          ? 'checked'
                          : selectedModelId === model.id
                            ? 'checked'
                            : 'unchecked'
                      }
                      onPress={() => {
                        if (!alreadyAdded) {
                          setSelectedModelId(model.id);
                        }
                      }}
                      disabled={alreadyAdded}
                    />
                    <Text style={styles.modelName}>{model.id}</Text>
                    {alreadyAdded && (
                      <Text style={styles.alreadyAddedText}>
                        {l10n.settings.alreadyAdded}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* No models available */}
          {showPostConnection && availableModels.length === 0 && (
            <Text style={styles.noModelsText}>
              {l10n.settings.noModelsAvailable}
            </Text>
          )}

          {/* Probing indicator for chip selection */}
          {selectedServerId && isProbing && (
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
        </Sheet.ScrollView>
        <Sheet.Actions>
          <View style={styles.buttonsContainer}>
            <Button
              testID="add-model-button"
              mode="contained"
              onPress={handleAddModel}
              loading={isSaving}
              disabled={
                isSaving || !selectedModelId || availableModels.length === 0
              }
              style={styles.addButton}>
              {l10n.settings.addModel}
            </Button>
          </View>
        </Sheet.Actions>
      </Sheet>
    );
  },
);
