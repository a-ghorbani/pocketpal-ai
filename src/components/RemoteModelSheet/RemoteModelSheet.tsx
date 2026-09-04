import React, {
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {
  Text,
  Button,
  TextInput as PaperTextInput,
  Chip,
  RadioButton,
  ActivityIndicator,
  Icon,
  ProgressBar,
} from 'react-native-paper';
import {Dropdown} from '../ui';
import {observer} from 'mobx-react';
import debounce from 'lodash/debounce';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {serverStore} from '../../store';
import {L10nContext} from '../../utils';
import {isLocalHost} from '../../utils/network';
import {parseTimeoutMs} from '../../utils/timeout';
import {
  SERVER_TYPE_DROPDOWN_OPTIONS,
  seedServerType,
} from '../../utils/serverTypes';
import {ServerConfig} from '../../utils/types';
import {
  RemoteModelInfo,
  fetchModelsWithHeaders,
  detectServerType,
} from '../../api/openai';
import {deriveListCaps} from '../../utils/listCaps';
import {t} from '../../locales';
import type {
  RouterFailure,
  RouterOpKind,
  RouterRowState,
} from '../../utils/routerState';
import {formatBytes} from '../../utils/formatters';

import {createStyles} from './styles';
import {
  canToggleFavourite,
  isServerOffline,
  serverFavouriteModelIds,
  serverLastUsedRemoteModelId,
  toggleFavourite,
} from './siblingReads';
import {ChatIcon, EyeIcon, EyeOffIcon} from '../../assets/icons';

type RouterGroup = 'loaded' | 'downloading' | 'available';

const ROUTER_GROUPS: RouterGroup[] = ['loaded', 'downloading', 'available'];

const routerGroupLabels = (l10n: any): Record<RouterGroup, string> => ({
  loaded: l10n.settings.routerModels.loadedGroup,
  downloading: l10n.settings.routerModels.downloadingGroup,
  available: l10n.settings.routerModels.availableGroup,
});

/**
 * A row's own state, in words. `sleeping` is deliberately not called that: the
 * word is reserved for whether a whole server is awake, and the two would read
 * as contradicting each other.
 */
const routerStateLabel = (state: RouterRowState, l10n: any): string | null => {
  switch (state) {
    case 'loading':
      return l10n.settings.routerModels.stateLoading;
    case 'loaded':
      return l10n.settings.routerModels.stateLoaded;
    case 'sleeping':
      return l10n.settings.routerModels.stateResident;
    case 'downloading':
      return l10n.settings.routerModels.stateDownloading;
    case 'unloaded':
    case 'failed':
      return l10n.settings.routerModels.stateUnloaded;
    case 'unknown':
    case 'absent':
      return null;
  }
};

/**
 * While an operation holds a row, the operation is what the row says it is
 * doing. An unload names itself in the action column instead, where the button
 * it replaces was.
 */
const routerOpLabel = (kind: RouterOpKind, l10n: any): string | null => {
  switch (kind) {
    case 'load':
      return l10n.settings.routerModels.stateLoading;
    case 'download':
      return l10n.settings.routerModels.stateDownloading;
    case 'unload':
      return null;
  }
};

const routerFailureLabel = (
  cause: RouterFailure['cause'],
  l10n: any,
): string => {
  switch (cause) {
    case 'load-failed':
      return l10n.settings.routerModels.loadFailed;
    case 'unload-not-released':
      return l10n.settings.routerModels.unloadNotReleased;
    case 'download-not-fetched':
      return l10n.settings.routerModels.downloadNotFetched;
    case 'server-unreachable':
      return l10n.settings.routerModels.serverUnreachable;
  }
};

/**
 * A downloading model is not selectable, so it sits in its own group rather
 * than under Available where it would offer an action that does nothing.
 */
function routerGroupOf(state: RouterRowState): RouterGroup {
  switch (state) {
    case 'loaded':
    case 'loading':
    case 'sleeping':
      return 'loaded';
    case 'downloading':
      return 'downloading';
    case 'unloaded':
    case 'failed':
    case 'unknown':
    case 'absent':
      return 'available';
  }
}

function routerGroupOfOp(kind: RouterOpKind): RouterGroup {
  switch (kind) {
    case 'download':
      return 'downloading';
    case 'load':
    case 'unload':
      return 'loaded';
  }
}

function routerRowGroup(serverId: string, modelId: string): RouterGroup {
  const op = serverStore.routerOp(serverId, modelId);
  return op
    ? routerGroupOfOp(op.kind)
    : routerGroupOf(serverStore.routerRowState(serverId, modelId));
}

/**
 * Group first, then favourites and the last-used model inside each group. A
 * favourite that is not loaded stays where its state puts it.
 */
function orderRouterRows(
  rows: RemoteModelInfo[],
  serverId: string,
): RemoteModelInfo[] {
  const favourites = serverFavouriteModelIds();
  const lastUsed = serverLastUsedRemoteModelId();
  const rank = (row: RemoteModelInfo) => {
    const key = `${serverId}/${row.id}`;
    if (favourites.includes(key) || favourites.includes(row.id)) {
      return 0;
    }
    return key === lastUsed || row.id === lastUsed ? 1 : 2;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

interface RemoteModelSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
  onModelAdded?: () => void;
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
    const [timeoutSeconds, setTimeoutSeconds] = useState('');
    const [serverType, setServerType] = useState('unknown');
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

    // Server-side download
    const [downloadReference, setDownloadReference] = useState('');
    const [downloadError, setDownloadError] = useState<string | null>(null);

    // Keep apiKey in a ref so debounced function reads current value
    const apiKeyRef = useRef(apiKey);
    useEffect(() => {
      apiKeyRef.current = apiKey;
    }, [apiKey]);

    const timeoutSecondsRef = useRef(timeoutSeconds);
    useEffect(() => {
      timeoutSecondsRef.current = timeoutSeconds;
    }, [timeoutSeconds]);

    // Reset all state when sheet reopens
    useEffect(() => {
      if (isVisible) {
        setUrl('');
        setServerName('');
        setApiKey('');
        setTimeoutSeconds('');
        timeoutSecondsRef.current = '';
        setServerType('unknown');
        setSecureTextEntry(true);
        setIsProbing(false);
        setProbeResult(null);
        setAvailableModels([]);
        setSelectedModelId(null);
        setSelectedServerId(null);
        setIsSaving(false);
        setUrlError('');
        setDownloadReference('');
        setDownloadError(null);
      }
    }, [isVisible]);

    const probeServer = useCallback(
      async (probeUrl: string) => {
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
          setUrlError(l10n.settings.serverUrlInvalid);
          return;
        }
        setUrlError('');
        setIsProbing(true);
        setProbeResult(null);
        try {
          const key = apiKeyRef.current.trim() || undefined;
          const timeoutMs = parseTimeoutMs(timeoutSecondsRef.current);
          const {models, headers} = await fetchModelsWithHeaders(
            trimmedUrl,
            key,
            timeoutMs,
          );
          setProbeResult({ok: true});
          setAvailableModels(models);
          if (models.length === 1) {
            setSelectedModelId(models[0].id);
          }
          const detected = await detectServerType(trimmedUrl, models, headers);
          setServerType(seedServerType(detected, trimmedUrl));
          setServerName(prev => {
            if (prev) {
              return prev;
            }
            if (detected) {
              return detected;
            }
            try {
              return new URL(trimmedUrl).hostname;
            } catch {
              return '';
            }
          });
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
    const handleServerChipPress = useCallback(async (server: ServerConfig) => {
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
        // Through the store's own fetch: it is what stamps the shape of the
        // response beside the rows, and router detection and the ranking of
        // rows both read that stamp.
        const result = await serverStore.fetchModelsForServer(server.id);
        if (!result.ok) {
          setProbeResult({ok: false, error: result.error});
          return;
        }
        const models = serverStore.serverModels.get(server.id) ?? [];
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
    }, []);

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
            requestTimeoutMs: parseTimeoutMs(timeoutSeconds),
            serverType,
          });
          if (apiKey.trim()) {
            await serverStore.setApiKey(serverId, apiKey.trim());
          }
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
      timeoutSeconds,
      serverType,
      onModelAdded,
      onDismiss,
    ]);

    const isRouter =
      !!selectedServerId && serverStore.isRouterServer(selectedServerId);

    // The stream is what makes progress fractional; it is also what says
    // whether this build has a download endpoint at all.
    useEffect(() => {
      if (isVisible && isRouter && selectedServerId) {
        const watched = selectedServerId;
        serverStore.openRouterStream(watched);
        return () => serverStore.releaseRouterStream(watched);
      }
      return undefined;
    }, [isVisible, isRouter, selectedServerId]);

    const routerRows =
      isRouter && selectedServerId
        ? serverStore.routerPickerRows(selectedServerId)
        : [];

    const handleDownload = useCallback(async () => {
      const reference = downloadReference.trim();
      if (!reference || !selectedServerId) {
        return;
      }
      setDownloadError(null);
      const result = await serverStore.startRouterDownload(
        selectedServerId,
        reference,
      );
      if (result.accepted) {
        setDownloadReference('');
      } else {
        setDownloadError(
          result.message || l10n.settings.routerModels.downloadNotFetched,
        );
      }
    }, [downloadReference, selectedServerId, l10n]);

    const renderVisionSlot = (model: RemoteModelInfo) => {
      if (serverTypeInEffect !== 'llama.cpp') {
        return null;
      }
      const listCaps = deriveListCaps(model, serverTypeInEffect);
      return (
        <View
          style={styles.modelVisionSlot}
          testID={`remote-model-row-vision-${model.id}`}
          accessible={true}
          accessibilityLabel={`${l10n.models.modelCard.labels.vision}: ${
            listCaps.supportsVision === true
              ? l10n.models.modelCard.labels.visionSupported
              : listCaps.supportsVision === false
                ? l10n.models.modelCard.labels.visionNotSupported
                : l10n.models.modelCard.labels.visionUnknown
          }`}>
          {listCaps.supportsVision === true ? (
            <EyeIcon
              width={16}
              height={16}
              stroke={theme.colors.iconModelTypeVision}
            />
          ) : listCaps.supportsVision === false ? (
            <ChatIcon
              width={16}
              height={16}
              stroke={theme.colors.iconModelTypeText}
            />
          ) : (
            <Text style={styles.modelVisionUnknown}>—</Text>
          )}
        </View>
      );
    };

    const renderRouterRow = (model: RemoteModelInfo, servId: string) => {
      const op = serverStore.routerOp(servId, model.id);
      const state = serverStore.routerRowState(servId, model.id);
      const live = serverStore.routerLive(servId, model.id);
      const failure = serverStore.routerReason(servId, model.id);
      const alreadyAdded = isModelAlreadyAdded(servId, model.id);
      // A model the server is still fetching, or one it never fetched at all,
      // is nothing this app can bind a session to yet.
      const selectable =
        !alreadyAdded &&
        op?.kind !== 'download' &&
        state !== 'downloading' &&
        state !== 'absent';
      const label = op
        ? routerOpLabel(op.kind, l10n)
        : routerStateLabel(state, l10n);
      const favourites = serverFavouriteModelIds();
      const isFavourite =
        favourites.includes(`${servId}/${model.id}`) ||
        favourites.includes(model.id);

      // 0.0 and 0 bytes are both real readings on the first tick, so the bar
      // is determinate at zero rather than absent.
      const bytes = live?.bytes;
      const fraction =
        op?.kind === 'download'
          ? bytes && bytes.total > 0
            ? bytes.done / bytes.total
            : undefined
          : live?.progress?.value;
      const determinate =
        typeof fraction === 'number' && fraction >= 0 && fraction <= 1;
      const showProgress = op?.kind === 'load' || op?.kind === 'download';

      const action = () => {
        if (op) {
          return op.kind === 'unload' ? (
            <Text
              style={styles.routerRowState}
              testID={`router-unloading-${model.id}`}>
              {l10n.settings.routerModels.unloading}
            </Text>
          ) : (
            <Button
              compact
              mode="text"
              testID={`router-cancel-${model.id}`}
              onPress={() => serverStore.cancelRouterOp(servId, model.id)}>
              {l10n.settings.routerModels.cancel}
            </Button>
          );
        }
        if (state === 'loaded' || state === 'sleeping') {
          return (
            <Button
              compact
              mode="text"
              testID={`router-unload-${model.id}`}
              onPress={() => serverStore.unloadRouterModel(servId, model.id)}>
              {l10n.settings.routerModels.unload}
            </Button>
          );
        }
        // Nothing for this app to start: the server is already doing it, or
        // has no such model to do it to.
        if (
          state === 'loading' ||
          state === 'downloading' ||
          state === 'absent'
        ) {
          return null;
        }
        return (
          <Button
            compact
            mode="text"
            testID={`router-load-${model.id}`}
            onPress={() =>
              serverStore.ensureRouterModelLoaded(servId, model.id)
            }>
            {l10n.settings.routerModels.load}
          </Button>
        );
      };

      return (
        <View key={model.id} testID={`router-row-${model.id}`}>
          <TouchableOpacity
            testID={`router-select-${model.id}`}
            // Each control in this row is its own target. Left focusable, the
            // row swallows Load, Unload, Cancel and the star, and activating
            // any of them selects the model instead.
            accessible={false}
            activeOpacity={selectable ? 0.6 : 1}
            style={[styles.modelRow, alreadyAdded && styles.modelRowDisabled]}
            onPress={() => {
              if (selectable) {
                setSelectedModelId(model.id);
              }
            }}>
            <RadioButton
              value={model.id}
              status={
                alreadyAdded || selectedModelId === model.id
                  ? 'checked'
                  : 'unchecked'
              }
              onPress={() => {
                if (selectable) {
                  setSelectedModelId(model.id);
                }
              }}
              disabled={!selectable}
              uncheckedColor={theme.colors.onSurfaceVariant}
            />
            <Text style={styles.modelName}>{model.id}</Text>
            <View style={styles.routerRowMeta}>
              {renderVisionSlot(model)}
              {label && (
                <Text
                  style={styles.routerRowState}
                  testID={`router-state-${model.id}`}>
                  {label}
                </Text>
              )}
              {canToggleFavourite() && (
                <TouchableOpacity
                  testID={`router-favourite-${model.id}`}
                  accessibilityRole="button"
                  accessibilityState={{selected: isFavourite}}
                  accessibilityLabel={l10n.settings.routerModels.favourite}
                  onPress={() => toggleFavourite(servId, model.id)}>
                  <Icon
                    source={isFavourite ? 'star' : 'star-outline'}
                    size={18}
                    color={theme.colors.onSurfaceVariant}
                  />
                </TouchableOpacity>
              )}
              {action()}
            </View>
          </TouchableOpacity>
          {showProgress && (
            <ProgressBar
              testID={`router-progress-${model.id}`}
              style={styles.routerRowProgress}
              indeterminate={!determinate}
              progress={determinate ? fraction : undefined}
            />
          )}
          {bytes && bytes.total > 0 && op?.kind === 'download' && (
            <Text
              style={[styles.routerRowState, styles.routerReasonRow]}
              testID={`router-bytes-${model.id}`}>
              {t(l10n.settings.routerModels.downloadedOf, {
                done: formatBytes(bytes.done, 1, false, true),
                total: formatBytes(bytes.total, 1, false, true),
              })}
            </Text>
          )}
          {failure && (
            <View style={styles.routerReasonRow}>
              <Text
                style={styles.routerReasonText}
                testID={`router-reason-${model.id}`}>
                {failure.message
                  ? `${routerFailureLabel(failure.cause, l10n)} ${failure.message}`
                  : routerFailureLabel(failure.cause, l10n)}
              </Text>
              <Button
                compact
                mode="text"
                testID={`router-dismiss-${model.id}`}
                onPress={() =>
                  serverStore.dismissRouterReason(servId, model.id)
                }>
                {l10n.settings.routerModels.dismiss}
              </Button>
            </View>
          )}
        </View>
      );
    };

    const selectedServer = selectedServerId
      ? serverStore.servers.find(s => s.id === selectedServerId)
      : null;

    // The type in effect, which is not always the type this sheet detected:
    // pressing a known-server chip never calls setServerType, so on the very
    // routers this exists for the local state is still 'unknown'.
    const serverTypeInEffect = selectedServer?.serverType ?? serverType;

    const showPostConnection = probeResult?.ok === true;
    // Show API key + server name fields when probe attempted (success OR auth failure)
    // This lets users enter an API key after a 401, then retry
    const showServerFields =
      probeResult !== null && !isProbing && !selectedServerId;

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
              <Icon
                source="alert-outline"
                size={18}
                color={theme.colors.onTertiaryContainer}
              />
              <Text style={styles.privacyText}>
                {l10n.settings.remotePrivacyNotice}
              </Text>
              <TouchableOpacity
                testID="privacy-notice-dismiss"
                style={styles.privacyDismiss}
                onPress={() => serverStore.acknowledgePrivacyNotice()}>
                <Icon
                  source="close"
                  size={18}
                  color={theme.colors.onTertiaryContainer}
                />
              </TouchableOpacity>
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

          {/* Server name + API key — shown after probe attempt (success OR failure)
              so user can enter API key after 401 and retry */}
          {showServerFields && (
            <>
              <View style={styles.inputSpacing}>
                <TextInput
                  testID="remote-name-input"
                  label={l10n.settings.serverName}
                  value={serverName}
                  onChangeText={setServerName}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputSpacing}>
                <TextInput
                  testID="remote-apikey-input"
                  label={l10n.settings.apiKey}
                  value={apiKey}
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

              <View style={styles.inputSpacing}>
                <TextInput
                  testID="remote-timeout-input"
                  label={l10n.settings.requestTimeout}
                  value={timeoutSeconds}
                  onChangeText={setTimeoutSeconds}
                  placeholder={l10n.settings.requestTimeoutPlaceholder}
                  keyboardType="numeric"
                />
                <Text style={styles.apiKeyDescription}>
                  {l10n.settings.requestTimeoutHelp}
                </Text>
              </View>

              <View style={styles.inputSpacing}>
                <Text>{l10n.settings.serverType}</Text>
                <Dropdown
                  testID="server-type-dropdown"
                  value={serverType}
                  options={SERVER_TYPE_DROPDOWN_OPTIONS}
                  onChange={setServerType}
                />
                <Text style={styles.apiKeyDescription}>
                  {l10n.settings.serverTypeHelp}
                </Text>
              </View>
            </>
          )}

          {/* Router model management */}
          {showPostConnection && isRouter && selectedServerId && (
            <View style={styles.modelListSection}>
              {isServerOffline(selectedServerId) ? (
                <View style={styles.routerNote}>
                  <Text style={styles.routerNoteText}>
                    {l10n.settings.routerModels.serverOffline}
                  </Text>
                </View>
              ) : (
                ROUTER_GROUPS.map(group => (
                  <View key={group}>
                    <View style={styles.routerGroupHeader}>
                      <Text style={styles.routerGroupTitle}>
                        {routerGroupLabels(l10n)[group]}
                      </Text>
                      {group === 'loaded' && (
                        <Text
                          style={styles.routerGroupCount}
                          testID="router-resident-count">
                          {t(l10n.settings.routerModels.residentCount, {
                            count:
                              serverStore.routerResidentCount(selectedServerId),
                          })}
                        </Text>
                      )}
                    </View>
                    {orderRouterRows(
                      routerRows.filter(
                        row =>
                          routerRowGroup(selectedServerId, row.id) === group,
                      ),
                      selectedServerId,
                    ).map(model => renderRouterRow(model, selectedServerId))}
                  </View>
                ))
              )}

              {serverStore.routerObservedEviction.has(selectedServerId) && (
                <View style={styles.routerNote} testID="router-eviction-note">
                  <Text style={styles.routerNoteText}>
                    {l10n.settings.routerModels.evictionNote}
                  </Text>
                </View>
              )}

              {serverStore.routerStreamCapFor(selectedServerId) ===
                'present' && (
                <View
                  style={styles.routerDownloadSection}
                  testID="router-download-field">
                  <Text style={styles.modelListLabel}>
                    {l10n.settings.routerModels.downloadLabel}
                  </Text>
                  <View style={styles.routerDownloadRow}>
                    <View style={styles.routerDownloadInput}>
                      <TextInput
                        testID="router-download-input"
                        label={l10n.settings.routerModels.downloadLabel}
                        value={downloadReference}
                        onChangeText={setDownloadReference}
                        placeholder={
                          l10n.settings.routerModels.downloadPlaceholder
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    <Button
                      compact
                      mode="contained-tonal"
                      testID="router-download-button"
                      disabled={!downloadReference.trim()}
                      onPress={handleDownload}>
                      {l10n.settings.routerModels.downloadAction}
                    </Button>
                  </View>
                  {downloadError && (
                    <Text style={styles.errorText}>{downloadError}</Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Model Selection */}
          {showPostConnection && !isRouter && availableModels.length >= 1 && (
            <View style={styles.modelListSection}>
              <Text style={styles.modelListLabel}>
                {l10n.settings.selectModel}
              </Text>
              {availableModels.map(model => {
                const servId = selectedServerId || '';
                const alreadyAdded =
                  !!selectedServerId && isModelAlreadyAdded(servId, model.id);
                return (
                  <TouchableOpacity
                    key={model.id}
                    activeOpacity={alreadyAdded ? 1 : 0.6}
                    style={[
                      styles.modelRow,
                      alreadyAdded && styles.modelRowDisabled,
                    ]}
                    onPress={() => {
                      if (!alreadyAdded) {
                        setSelectedModelId(model.id);
                      }
                    }}>
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
                      uncheckedColor={theme.colors.onSurfaceVariant}
                    />
                    <Text style={styles.modelName}>{model.id}</Text>
                    {alreadyAdded && (
                      <Text style={styles.alreadyAddedText}>
                        {l10n.settings.alreadyAdded}
                      </Text>
                    )}
                    {renderVisionSlot(model)}
                  </TouchableOpacity>
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
