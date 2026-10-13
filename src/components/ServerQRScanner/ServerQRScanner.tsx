import React, {useContext, useRef, useState} from 'react';
import {View} from 'react-native';
import {IconButton, Text} from 'react-native-paper';
import {
  Camera,
  CameraRuntimeError,
  Code,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

interface ServerQRScannerProps {
  onScanned: (url: string) => void;
  onClose: () => void;
}

const isServerUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !!parsed.hostname
    );
  } catch {
    return false;
  }
};

export const ServerQRScanner: React.FC<ServerQRScannerProps> = ({
  onScanned,
  onClose,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);
  const device = useCameraDevice('back');
  const acceptedRef = useRef(false);
  const [rejectedPayload, setRejectedPayload] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const showCamera = !!device && !cameraFailed;

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes: Code[]) => {
      setFrameError(false);
      if (acceptedRef.current) {
        return;
      }
      const url = codes.map(code => code.value?.trim() ?? '').find(isServerUrl);
      if (url) {
        acceptedRef.current = true;
        onScanned(url);
      } else {
        setRejectedPayload(true);
      }
    },
  });

  const handleCameraError = (error: CameraRuntimeError) => {
    if (error.code.startsWith('unknown/')) {
      setFrameError(true);
    } else {
      setCameraFailed(true);
    }
  };

  return (
    <View style={styles.container}>
      {showCamera ? (
        <Camera
          testID="server-qr-camera"
          style={styles.preview}
          device={device}
          isActive
          codeScanner={codeScanner}
          onError={handleCameraError}
        />
      ) : (
        <Text style={styles.message}>
          {cameraFailed
            ? l10n.settings.scanQrUnavailable
            : l10n.camera.noDevice}
        </Text>
      )}
      {showCamera && frameError && (
        <Text style={styles.notReadyHint}>{l10n.settings.scanQrNotReady}</Text>
      )}
      {showCamera && !frameError && rejectedPayload && (
        <Text style={styles.hint}>{l10n.settings.scanQrNotServer}</Text>
      )}
      <IconButton
        testID="server-qr-close"
        icon="close"
        accessibilityLabel={l10n.common.close}
        style={styles.closeButton}
        onPress={onClose}
      />
    </View>
  );
};
