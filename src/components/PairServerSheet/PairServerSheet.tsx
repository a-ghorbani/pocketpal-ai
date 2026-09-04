import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {View, TextInput as RNTextInput} from 'react-native';

import {observer} from 'mobx-react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ActivityIndicator, Button, Text} from 'react-native-paper';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
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
import type {ServerConfig} from '../../utils/types';

import {createStyles} from './styles';

type EntryState = 'scanning' | 'manual';
type SheetState = EntryState | 'confirming' | 'duplicate' | 'saving';

/** A settled probe and the key it ran with. */
interface Verdict {
  key: string;
  result: PairingProbeResult;
}

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
    const insets = useSafeAreaInsets();
    const styles = createStyles(theme, insets.bottom);

    const device = useCameraDevice('back');
    const {hasPermission, requestPermission} = useCameraPermission();
    const [permissionSettled, setPermissionSettled] = useState(false);
    const canScan = hasPermission && device != null;

    const [state, setState] = useState<SheetState>('scanning');
    const [entryState, setEntryState] = useState<EntryState>('manual');
    const [url, setUrl] = useState('');
    const [name, setName] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [verdict, setVerdict] = useState<Verdict | null>(null);
    const [isProbing, setIsProbing] = useState(false);
    const [scanError, setScanError] = useState(false);
    const [duplicate, setDuplicate] = useState<ServerConfig | null>(null);

    const canScanRef = useRef(canScan);
    canScanRef.current = canScan;

    const keyField = useRef<RNTextInput | null>(null);

    const probeGeneration = useRef(0);
    const inFlight = useRef<{
      key: string;
      result: Promise<PairingProbeResult>;
    } | null>(null);

    const runProbe = useCallback(
      (target: string, key: string): Promise<PairingProbeResult> => {
        const generation = ++probeGeneration.current;
        setIsProbing(true);
        setVerdict(null);
        const result = probePairingTarget(target, {apiKey: key || undefined});
        inFlight.current = {key, result};
        result.then(settled => {
          if (probeGeneration.current !== generation) {
            return;
          }
          inFlight.current = null;
          setIsProbing(false);
          setVerdict({key, result: settled});
        });
        return result;
      },
      [],
    );

    const probeTypedKey = useCallback((): Promise<PairingProbeResult> => {
      if (inFlight.current?.key === apiKey) {
        return inFlight.current.result;
      }
      return runProbe(url, apiKey);
    }, [apiKey, url, runProbe]);

    const accept = useCallback(
      (parsed: PairingRequest, from: EntryState) => {
        const existing = serverStore.servers.find(s =>
          sameServerUrl(s.url, parsed.url),
        );
        setUrl(parsed.url);
        setName(parsed.name ?? '');
        setApiKey(parsed.apiKey ?? '');
        setEntryState(from);
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

    // Only where the camera can actually be reached: iOS prompts once for the
    // life of the install, and two Android denials become permanent.
    const scannerReachable =
      !request && (state === 'scanning' || state === 'manual');

    useEffect(() => {
      if (!isVisible || !scannerReachable) {
        return;
      }
      if (hasPermission) {
        setPermissionSettled(true);
        return;
      }
      let abandoned = false;
      requestPermission().finally(() => {
        if (!abandoned) {
          setPermissionSettled(true);
        }
      });
      return () => {
        abandoned = true;
      };
    }, [isVisible, scannerReachable, hasPermission, requestPermission]);

    useEffect(() => {
      if (!isVisible) {
        return;
      }
      probeGeneration.current += 1;
      inFlight.current = null;
      setVerdict(null);
      setIsProbing(false);
      setScanError(false);
      setDuplicate(null);
      if (request) {
        accept(request, 'manual');
        return;
      }
      setUrl('');
      setName('');
      setApiKey('');
      setEntryState(canScanRef.current ? 'scanning' : 'manual');
      setState(canScanRef.current ? 'scanning' : 'manual');
    }, [isVisible, request, accept]);

    useEffect(() => {
      if (verdict?.result.outcome === 'unauthorized') {
        keyField.current?.focus();
      }
    }, [verdict]);

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
        accept(parsed, 'scanning');
      },
    });

    const confirmManual = useCallback(() => {
      const parsed = parsePairingURL(url);
      if (!parsed) {
        setScanError(true);
        return;
      }
      accept(
        {
          ...parsed,
          name: name || parsed.name,
          apiKey: apiKey || parsed.apiKey,
        },
        'manual',
      );
    }, [url, name, apiKey, accept]);

    const goBack = useCallback(() => {
      probeGeneration.current += 1;
      inFlight.current = null;
      setVerdict(null);
      setIsProbing(false);
      setScanError(false);
      setState(entryState);
    }, [entryState]);

    const add = useCallback(async () => {
      setState('saving');
      const result =
        verdict?.key === apiKey ? verdict.result : await probeTypedKey();
      if (result.outcome !== 'usable') {
        setState('confirming');
        return;
      }
      const serverId = serverStore.addServer({
        name: name || url,
        url,
        serverType: result.serverType,
      });
      if (apiKey) {
        await serverStore.setApiKey(serverId, apiKey);
      }
      serverStore
        .probeServerPresence(serverId, {reason: 'user'})
        .catch(() => {});
      onPaired?.(serverId);
      onDismiss();
    }, [verdict, apiKey, probeTypedKey, name, url, onPaired, onDismiss]);

    const typedKeyVerdict = verdict?.key === apiKey ? verdict.result : null;
    const canAdd =
      typedKeyVerdict === null || typedKeyVerdict.outcome === 'usable';

    const manualHint = !device
      ? {testID: 'pair-server-no-camera', text: l10n.models.pairServer.noCamera}
      : permissionSettled && !hasPermission
        ? {
            testID: 'pair-server-camera-denied',
            text: l10n.models.pairServer.cameraDenied,
          }
        : null;

    const renderVerdict = () => {
      if (isProbing) {
        return (
          <View style={styles.verdict}>
            <ActivityIndicator testID="pair-server-probing" />
            <Text style={styles.verdictText}>
              {l10n.models.pairServer.checking}
            </Text>
          </View>
        );
      }
      if (!typedKeyVerdict) {
        return null;
      }

      switch (typedKeyVerdict.outcome) {
        case 'usable': {
          const count = typedKeyVerdict.models.length;
          const credentials = !apiKey
            ? l10n.models.pairServer.noKeySupplied
            : typedKeyVerdict.authorisation === 'authorised'
              ? l10n.models.pairServer.credentialsVerified
              : l10n.models.pairServer.credentialsUnverified;
          return (
            <View style={styles.verdict}>
              <Text testID="pair-server-models" style={styles.verdictText}>
                {count === 0
                  ? l10n.models.pairServer.noModelsYet
                  : count === 1
                    ? l10n.models.pairServer.oneModel
                    : l10n.models.pairServer.modelCount.replace(
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
                String(typedKeyVerdict.status),
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

    // The sheet pans rather than resizes for the keyboard, so a pinned footer
    // would sit behind it; these rows scroll with the keyboard-aware body.
    const renderActions = () => {
      switch (state) {
        case 'scanning':
          return canScan ? (
            <View style={styles.actions}>
              <Button
                testID="pair-server-manual"
                onPress={() => setState('manual')}>
                {l10n.settings.enterUrlManually}
              </Button>
            </View>
          ) : null;
        case 'manual':
          return (
            <View style={styles.actionsSplit}>
              {canScan ? (
                <Button
                  testID="pair-server-scan"
                  onPress={() => setState('scanning')}>
                  {l10n.models.pairServer.scanInstead}
                </Button>
              ) : (
                <View />
              )}
              <Button testID="pair-server-continue" onPress={confirmManual}>
                {l10n.models.pairServer.add}
              </Button>
            </View>
          );
        case 'duplicate':
          return (
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
          );
        case 'confirming':
        case 'saving':
          return (
            <View style={styles.actionsSplit}>
              <Button testID="pair-server-back" onPress={goBack}>
                {l10n.models.pairServer.back}
              </Button>
              <View style={styles.actionsRight}>
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
            </View>
          );
      }
    };

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onDismiss}
        title={
          state === 'duplicate'
            ? l10n.models.pairServer.duplicateTitle
            : l10n.models.pairServer.title
        }>
        <Sheet.ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {state === 'scanning' && canScan && (
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
              {manualHint && (
                <Text testID={manualHint.testID} style={styles.hint}>
                  {manualHint.text}
                </Text>
              )}
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
            </>
          )}

          {state === 'duplicate' && (
            <Text testID="pair-server-duplicate" style={styles.verdictText}>
              {l10n.models.pairServer.duplicateMessage.replace(
                '{{name}}',
                duplicate?.name ?? '',
              )}
            </Text>
          )}

          {(state === 'confirming' || state === 'saving') && (
            <>
              <Text testID="pair-server-url-label" style={styles.url}>
                {url}
              </Text>
              <Text testID="pair-server-trust" style={styles.notice}>
                {l10n.settings.remotePrivacyNotice}
              </Text>
              <TextInput
                ref={keyField}
                testID="pair-server-key"
                label={l10n.models.pairServer.apiKeyLabel}
                value={apiKey}
                onChangeText={setApiKey}
                autoCapitalize="none"
                secureTextEntry
              />
              {renderVerdict()}
            </>
          )}

          {renderActions()}
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);
