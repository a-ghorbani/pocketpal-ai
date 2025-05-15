import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  CameraPosition,
} from 'react-native-vision-camera';
import {observer} from 'mobx-react';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import 'react-native-get-random-values';

interface CameraViewProps {
  onCapture: (imagePath: string) => void;
  onClose: () => void;
}

export const CameraView = observer(({onCapture, onClose}: CameraViewProps) => {
  const theme = useTheme();
  const styles = createStyles({theme});
  const l10n = React.useContext(L10nContext);
  const {hasPermission, requestPermission} = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('back');
  const [isCapturing, setIsCapturing] = useState(false);
  const camera = useRef<Camera>(null);
  const device = useCameraDevice(cameraPosition);

  useEffect(() => {
    if (!hasPermission) {
      const requestCameraPermission = async () => {
        try {
          console.log('Requesting camera permission...');
          const result = await requestPermission();
          console.log('Camera permission result:', result);
          if (!result) {
            // Permission was denied
            Alert.alert(
              l10n.camera.permissionTitle,
              l10n.camera.permissionMessage,
              [
                {
                  text: l10n.common.ok,
                  onPress: onClose,
                },
              ],
            );
          }
        } catch (error) {
          console.error('Error requesting camera permission:', error);
          Alert.alert(
            l10n.camera.permissionTitle,
            l10n.camera.permissionMessage,
            [
              {
                text: l10n.common.ok,
                onPress: onClose,
              },
            ],
          );
        }
      };

      requestCameraPermission();
    }
  }, [hasPermission, requestPermission, onClose, l10n]);

  const handleCapture = useCallback(async () => {
    if (camera.current && !isCapturing) {
      setIsCapturing(true);
      try {
        const photo = await camera.current.takePhoto({
          flash: 'off',
        });

        const path =
          Platform.OS === 'ios' ? photo.path : `file://${photo.path}`;

        onCapture(path);
      } catch (error) {
        console.error('Error taking photo:', error);
        Alert.alert(l10n.camera.errorTitle, l10n.camera.errorMessage, [
          {
            text: l10n.common.ok,
          },
        ]);
      } finally {
        setIsCapturing(false);
      }
    }
  }, [camera, isCapturing, onCapture, l10n]);

  const toggleCameraPosition = useCallback(() => {
    setCameraPosition(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          {l10n.camera.requestingPermission}
        </Text>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>{l10n.camera.noDevice}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={styles.camera}
        device={device}
        isActive={true}
        photo={true}
      />
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          disabled={isCapturing}>
          <Text style={styles.closeButtonText}>{l10n.common.close}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleCapture}
          disabled={isCapturing}>
          {isCapturing ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <View style={styles.captureButtonInner} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.flipButton}
          onPress={toggleCameraPosition}
          disabled={isCapturing}>
          <Text style={styles.flipButtonText}>{l10n.camera.flip}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default CameraView;
