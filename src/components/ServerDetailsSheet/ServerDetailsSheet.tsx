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
import {Dropdown} from '../ui';
import {observer} from 'mobx-react';
import debounce from 'lodash/debounce';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {serverStore} from '../../store';
import {L10nContext} from '../../utils';
import {parseTimeoutMs} from '../../utils/timeout';
import {SERVER_TYPE_DROPDOWN_OPTIONS} from '../../utils/serverTypes';
import {testConnection} from '../../api/openai';
import {isLocalHost} from '../../utils/network';
import {t} from '../../locales';

import {createStyles} from './styles';
import {EyeIcon, EyeOffIcon} from '../../assets/icons';
import {
  resolveRemoteProtocol,
  type RemoteApiMode,
} from '../../utils/remoteProtocol';
import {
  API_MODE_VALUES,
  protocolLabel,
  protocolSourceLabel,
  protocolWarningKey,
} from '../RemoteModelSheet/protocolUi';

interface ServerDetailsSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
  serverId: string | null;
}

const hasSameOrigin = (left: string, right: string): boolean => {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
};

export const ServerDetailsSheet: React.FC<ServerDetailsSheetProps> = observer(
  ({isVisible, onDismiss, serverId}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);

    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [timeoutSeconds, setTimeoutSeconds] = useState('');
    const [serverType, setServerType] = useState('unknown');
    const [apiMode, setApiMode] = useState<RemoteApiMode>('auto');
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

    const timeoutSecondsRef = useRef(timeoutSeconds);
    useEffect(() => {
      timeoutSecondsRef.current = timeoutSeconds;
    }, [timeoutSeconds]);

    const serverTypeRef = useRef(serverType);
    const probeGenerationRef = useRef(0);

    const invalidateProbe = useCallback(() => {
      probeGenerationRef.current += 1;
      setProbeResult(null);
      setIsProbing(false);
    }, []);

    // Load server data when sheet opens
    useEffect(() => {
      if (isVisible && serverId) {
        const server = serverStore.servers.find(s => s.id === serverId);
        if (server) {
          setUrl(server.url);
          const seconds =
            server.requestTimeoutMs != null
              ? String(server.requestTimeoutMs / 1000)
              : '';
          setTimeoutSeconds(seconds);
          timeoutSecondsRef.current = seconds;
          setServerType(server.serverType || 'unknown');
          serverTypeRef.current = server.serverType || 'unknown';
          setApiMode(server.apiMode || 'auto');
        }
        serverStore.getApiKey(serverId).then(key => {
          setApiKey(key || '');
          apiKeyRef.current = key || '';
        });
        setProbeResult(null);
        setSecureTextEntry(true);
        setIsSaving(false);
      } else {
        probeGenerationRef.current += 1;
      }
    }, [isVisible, serverId]);

    const server = serverId
      ? serverStore.servers.find(s => s.id === serverId)
      : null;

    const userModels = serverId
      ? serverStore.getUserSelectedModelsForServer(serverId)
      : [];

    const probeServer = useCallback(
      async (probeUrl: string, probeServerType: string) => {
        const trimmedUrl = probeUrl.trim();
        if (!trimmedUrl) {
          return;
        }
        try {
          // Validate URL format — throws on invalid
          const parsed = new URL(trimmedUrl);
          if (
            !parsed.hostname ||
            (parsed.protocol !== 'https:' && !isLocalHost(trimmedUrl))
          ) {
            throw new Error('No hostname');
          }
        } catch {
          return;
        }
        const probeGeneration = ++probeGenerationRef.current;
        setIsProbing(true);
        setProbeResult(null);
        try {
          const savedServer = serverId
            ? serverStore.servers.find(s => s.id === serverId)
            : undefined;
          const key =
            savedServer && hasSameOrigin(trimmedUrl, savedServer.url)
              ? apiKeyRef.current.trim() || undefined
              : undefined;
          const timeoutMs =
            parseTimeoutMs(timeoutSecondsRef.current) ??
            savedServer?.requestTimeoutMs;
          const result = await testConnection(
            trimmedUrl,
            key,
            timeoutMs,
            probeServerType,
          );
          if (probeGeneration === probeGenerationRef.current) {
            setProbeResult({ok: result.ok, error: result.error});
          }
        } catch (error: any) {
          if (probeGeneration === probeGenerationRef.current) {
            setProbeResult({ok: false, error: error.message});
          }
        } finally {
          if (probeGeneration === probeGenerationRef.current) {
            setIsProbing(false);
          }
        }
      },
      [serverId],
    );

    const debouncedProbe = useMemo(
      () => debounce(probeServer, 800),
      [probeServer],
    );

    // Re-probe on apiKey blur
    const handleApiKeyBlur = useCallback(() => {
      if (url.trim()) {
        debouncedProbe(url, serverTypeRef.current);
      }
    }, [url, debouncedProbe]);

    const handleServerTypeChange = useCallback(
      (value: string) => {
        serverTypeRef.current = value;
        setServerType(value);
        debouncedProbe.cancel();
        invalidateProbe();
        if (url.trim()) {
          debouncedProbe(url, value);
        }
      },
      [url, debouncedProbe, invalidateProbe],
    );

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
          requestTimeoutMs: parseTimeoutMs(timeoutSeconds),
          serverType,
          apiMode,
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
    }, [
      serverId,
      server,
      url,
      apiKey,
      timeoutSeconds,
      serverType,
      apiMode,
      onDismiss,
    ]);

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
    const protocolOptions = API_MODE_VALUES.map(value => ({
      value,
      label:
        value === 'auto'
          ? l10n.settings.apiProtocolAuto
          : value === 'chat-completions'
            ? l10n.settings.apiProtocolChatCompletions
            : l10n.settings.apiProtocolResponses,
      testID: `api-protocol-option-${value}`,
    }));
    const protocolLabels = {
      chatCompletions: l10n.settings.apiProtocolChatCompletions,
      responses: l10n.settings.apiProtocolResponses,
      unsupported: l10n.settings.apiProtocolUnsupported,
    };
    const sourceLabels = {
      modelOverride: l10n.settings.apiProtocolSourceModel,
      serverOverride: l10n.settings.apiProtocolSourceServer,
      liveCatalog: l10n.settings.apiProtocolSourceLiveCatalog,
      cachedCatalog: l10n.settings.apiProtocolSourceCachedCatalog,
      compatibilityDefault: l10n.settings.apiProtocolSourceCompatibility,
    };

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
                debouncedProbe.cancel();
                invalidateProbe();
                setUrl(text);
                debouncedProbe(text, serverTypeRef.current);
              }}
              placeholder={l10n.settings.serverUrlPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          {/* Request Timeout Input */}
          <View style={styles.inputSpacing}>
            <TextInput
              testID="server-details-timeout-input"
              label={l10n.settings.requestTimeout}
              defaultValue={timeoutSeconds}
              onChangeText={setTimeoutSeconds}
              placeholder={l10n.settings.requestTimeoutPlaceholder}
              keyboardType="numeric"
            />
            <Text style={styles.apiKeyDescription}>
              {l10n.settings.requestTimeoutHelp}
            </Text>
          </View>

          {/* Server Type selector */}
          <View style={styles.inputSpacing}>
            <Text>{l10n.settings.serverType}</Text>
            <Dropdown
              testID="server-type-dropdown"
              value={serverType}
              options={SERVER_TYPE_DROPDOWN_OPTIONS}
              onChange={handleServerTypeChange}
            />
            <Text style={styles.apiKeyDescription}>
              {l10n.settings.serverTypeHelp}
            </Text>
          </View>

          <View style={styles.inputSpacing}>
            <Text>{l10n.settings.apiProtocol}</Text>
            <Dropdown
              testID="api-protocol-dropdown"
              value={apiMode}
              options={protocolOptions}
              onChange={value => setApiMode(value as RemoteApiMode)}
            />
            <Text style={styles.apiKeyDescription}>
              {l10n.settings.apiProtocolHelp}
            </Text>
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
              {userModels.map(m => {
                const modelId = `${serverId}/${m.remoteModelId}`;
                const protocol = resolveRemoteProtocol({
                  modelPreference:
                    serverStore.getRemoteModelPreference?.(modelId),
                  apiMode,
                  catalog: serverStore.getRemoteCatalogModel?.(modelId),
                });
                const warning = protocolWarningKey(protocol);
                return (
                  <View key={m.remoteModelId} style={styles.modelItem}>
                    <View style={styles.modelDot} />
                    <View style={styles.modelItemDetails}>
                      <Text style={styles.modelItemText}>
                        {m.remoteModelId}
                      </Text>
                      <Text
                        testID={`server-model-protocol-${m.remoteModelId}`}
                        style={styles.protocolText}>
                        {t(l10n.settings.apiProtocolEffective, {
                          protocol: protocolLabel(
                            protocol.wireApi,
                            protocolLabels,
                          ),
                          source: protocolSourceLabel(
                            protocol.source,
                            sourceLabels,
                          ),
                        })}
                      </Text>
                      {warning && (
                        <Text style={styles.protocolWarning}>
                          {warning === 'unsupported'
                            ? l10n.settings.apiProtocolWarningUnsupported
                            : warning === 'contradiction'
                              ? l10n.settings.apiProtocolWarningContradiction
                              : l10n.settings.apiProtocolWarningUnknown}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
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
