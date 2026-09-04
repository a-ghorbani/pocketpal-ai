import React, {useCallback, useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {observer} from 'mobx-react';
import {ActivityIndicator, Button, Text} from 'react-native-paper';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {serverStore} from '../../store';
import {L10nContext} from '../../utils';
import {parsePairingURL, sameServerUrl} from '../../services/pairingLink';
import type {PairingRequest} from '../../services/pairingLink';
import {probePairingTarget} from '../../api/openai';
import type {PairingProbeResult} from '../../api/openai';
import {seedServerType} from '../../utils/serverTypes';
import type {ServerConfig} from '../../utils/types';

import {createStyles} from './styles';

type SheetState = 'scanning' | 'manual' | 'confirming' | 'duplicate' | 'saving';

interface PairServerSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
  /** A link parked by the deep-link handler; opens the sheet at `confirming`. */
  request?: PairingRequest | null;
  onPaired?: (serverId: string) => void;
}

export const PairServerSheet: React.FC<PairServerSheetProps> = observer(
  ({isVisible, onDismiss, request, onPaired}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);

    const device = useCameraDevice('back');

    const [state, setState] = useState<SheetState>('scanning');
    const [url, setUrl] = useState('');
    const [name, setName] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [probe, setProbe] = useState<PairingProbeResult | null>(null);
    const [isProbing, setIsProbing] = useState(false);
    const [scanError, setScanError] = useState(false);
    const [duplicate, setDuplicate] = useState<ServerConfig | null>(null);

    const runProbe = useCallback(async (target: string, key: string) => {
      setIsProbing(true);
      setProbe(null);
      const result = await probePairingTarget(target, {
        apiKey: key || undefined,
      });
      setIsProbing(false);
      setProbe(result);
    }, []);

    const accept = useCallback(
      (parsed: PairingRequest) => {
        const existing = serverStore.servers.find(s =>
          sameServerUrl(s.url, parsed.url),
        );
        setUrl(parsed.url);
        setName(parsed.name ?? '');
        setApiKey(parsed.apiKey ?? '');
        if (existing) {
          setDuplicate(existing);
          setState('duplicate');
          return;
        }
        setDuplicate(null);
        setState('confirming');
        runProbe(parsed.url, parsed.apiKey ?? '');
      },
      [runProbe],
    );

    useEffect(() => {
      if (!isVisible) {
        return;
      }
      setProbe(null);
      setIsProbing(false);
      setScanError(false);
      setDuplicate(null);
      if (request) {
        accept(request);
        return;
      }
      setUrl('');
      setName('');
      setApiKey('');
      setState(device ? 'scanning' : 'manual');
    }, [isVisible, request, device, accept]);

    const codeScanner = useCodeScanner({
      codeTypes: ['qr'],
      onCodeScanned: codes => {
        if (state !== 'scanning') {
          return;
        }
        const value = codes[0]?.value;
        const parsed = value ? parsePairingURL(value) : null;
        if (!parsed) {
          setScanError(true);
          return;
        }
        setScanError(false);
        accept(parsed);
      },
    });

    const confirmManual = useCallback(() => {
      const parsed = parsePairingURL(url);
      if (!parsed) {
        setScanError(true);
        return;
      }
      accept({
        ...parsed,
        name: name || parsed.name,
        apiKey: apiKey || parsed.apiKey,
      });
    }, [url, name, apiKey, accept]);

    const add = useCallback(async () => {
      setState('saving');
      const detected =
        probe?.outcome === 'usable'
          ? probe.serverType
          : seedServerType('', url);
      const serverId = serverStore.addServer({
        name: name || url,
        url,
        serverType: detected,
      });
      if (apiKey) {
        await serverStore.setApiKey(serverId, apiKey);
      }
      serverStore
        .probeServerPresence(serverId, {reason: 'user'})
        .catch(() => {});
      onPaired?.(serverId);
      onDismiss();
    }, [probe, url, name, apiKey, onPaired, onDismiss]);

    const canAdd = probe?.outcome === 'usable' && !isProbing;

    const renderVerdict = () => {
      if (isProbing || !probe) {
        return (
          <View style={styles.verdict}>
            <ActivityIndicator testID="pair-server-probing" />
            <Text style={styles.verdictText}>
              {l10n.models.pairServer.checking}
            </Text>
          </View>
        );
      }

      switch (probe.outcome) {
        case 'usable': {
          const count = probe.models.length;
          const credentials = !apiKey
            ? l10n.models.pairServer.noKeySupplied
            : probe.authorisation === 'authorised'
              ? l10n.models.pairServer.credentialsVerified
              : l10n.models.pairServer.credentialsUnverified;
          return (
            <View style={styles.verdict}>
              <Text testID="pair-server-models" style={styles.verdictText}>
                {count === 0
                  ? l10n.models.pairServer.noModelsYet
                  : l10n.models.pairServer.modelCount_other.replace(
                      '{{count}}',
                      String(count),
                    )}
              </Text>
              <Text
                testID="pair-server-credentials"
                style={styles.credentialText}>
                {credentials}
              </Text>
            </View>
          );
        }
        case 'unauthorized':
          return (
            <Text testID="pair-server-verdict" style={styles.errorText}>
              {l10n.models.pairServer.credentialsRefused}
            </Text>
          );
        case 'unreadable':
          return (
            <Text testID="pair-server-verdict" style={styles.errorText}>
              {l10n.models.pairServer.notAModelServer}
            </Text>
          );
        case 'server-error':
          return (
            <Text testID="pair-server-verdict" style={styles.errorText}>
              {l10n.models.pairServer.serverAnswered.replace(
                '{{status}}',
                String(probe.status),
              )}
            </Text>
          );
        default:
          return (
            <Text testID="pair-server-verdict" style={styles.errorText}>
              {l10n.models.pairServer.unreachable}
            </Text>
          );
      }
    };

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onDismiss}
        title={l10n.models.pairServer.title}>
        <Sheet.ScrollView contentContainerStyle={styles.body}>
          {state === 'scanning' && device && (
            <>
              <View style={styles.camera}>
                <Camera
                  testID="pair-server-camera"
                  style={styles.cameraFill}
                  device={device}
                  isActive={isVisible}
                  codeScanner={codeScanner}
                />
              </View>
              <Text style={styles.hint}>
                {scanError
                  ? l10n.models.pairServer.notAServerQr
                  : l10n.models.pairServer.scanHint}
              </Text>
            </>
          )}

          {state === 'manual' && (
            <>
              <Text testID="pair-server-no-camera" style={styles.hint}>
                {l10n.models.pairServer.noCamera}
              </Text>
              <TextInput
                testID="pair-server-url"
                label={l10n.models.pairServer.urlLabel}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
              />
              <TextInput
                testID="pair-server-name"
                label={l10n.models.pairServer.nameLabel}
                value={name}
                onChangeText={setName}
              />
              <TextInput
                testID="pair-server-key"
                label={l10n.models.pairServer.apiKeyLabel}
                value={apiKey}
                onChangeText={setApiKey}
                autoCapitalize="none"
                secureTextEntry
              />
              {scanError && (
                <Text style={styles.errorText}>
                  {l10n.models.pairServer.notAServerQr}
                </Text>
              )}
              <View style={styles.actions}>
                <Button testID="pair-server-continue" onPress={confirmManual}>
                  {l10n.models.pairServer.add}
                </Button>
              </View>
            </>
          )}

          {state === 'duplicate' && (
            <>
              <Text testID="pair-server-duplicate" style={styles.verdictText}>
                {l10n.models.pairServer.duplicateMessage.replace(
                  '{{name}}',
                  duplicate?.name ?? '',
                )}
              </Text>
              <View style={styles.actions}>
                <Button testID="pair-server-cancel" onPress={onDismiss}>
                  {l10n.common.cancel}
                </Button>
                <Button
                  testID="pair-server-use"
                  mode="contained"
                  onPress={() => {
                    if (duplicate) {
                      onPaired?.(duplicate.id);
                    }
                    onDismiss();
                  }}>
                  {l10n.models.pairServer.use}
                </Button>
              </View>
            </>
          )}

          {(state === 'confirming' || state === 'saving') && (
            <>
              <Text style={styles.url}>{url}</Text>
              <TextInput
                testID="pair-server-key"
                label={l10n.models.pairServer.apiKeyLabel}
                value={apiKey}
                onChangeText={setApiKey}
                onBlur={() => runProbe(url, apiKey)}
                autoCapitalize="none"
                secureTextEntry
              />
              {renderVerdict()}
              <View style={styles.actions}>
                <Button testID="pair-server-cancel" onPress={onDismiss}>
                  {l10n.common.cancel}
                </Button>
                <Button
                  testID="pair-server-add"
                  mode="contained"
                  disabled={!canAdd || state === 'saving'}
                  loading={state === 'saving'}
                  onPress={add}>
                  {l10n.models.pairServer.add}
                </Button>
              </View>
            </>
          )}
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);
