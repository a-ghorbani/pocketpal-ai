import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';

import {observer} from 'mobx-react';
import 'react-native-get-random-values';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  Camera,
  getCameraDevice,
  useCameraDevices,
  useCameraPermission,
  CameraDevice,
  CameraPosition,
} from 'react-native-vision-camera';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {ResponseBubble} from '../ResponseBubble';

import {L10nContext} from '../../utils';

interface EmbeddedVideoViewProps {
  onCapture: (imageBase64: string) => void;
  onClose: () => void;
  captureInterval: number;
  onCaptureIntervalChange: (interval: number) => void;
  responseText?: string;
}

export const EmbeddedVideoView = observer(
  ({
    onCapture,
    onClose,
    captureInterval,
    onCaptureIntervalChange,
    responseText,
  }: EmbeddedVideoViewProps) => {
    const theme = useTheme();
    const styles = createStyles({theme});
    const l10n = React.useContext(L10nContext);
    const {hasPermission, requestPermission} = useCameraPermission();
    const [cameraPosition, setCameraPosition] =
      useState<CameraPosition>('back');
    const [isCapturing, setIsCapturing] = useState(false);
    const camera = useRef<Camera>(null);
    const devices = useCameraDevices();
    const device: CameraDevice | undefined =
      getCameraDevice(devices, cameraPosition) ?? devices[0];
    const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Check if running in simulator - simplified check for iOS simulator
    const isSimulator = Platform.OS === 'ios' && !device;

    // Request camera permission if not granted
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
                l10n.video.permissionTitle,
                l10n.video.permissionMessage,
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
              l10n.video.permissionTitle,
              l10n.video.permissionMessage,
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

    const stopCapturing = useCallback(() => {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    }, []);

    const startCapturing = useCallback(() => {
      stopCapturing();

      captureTimerRef.current = setInterval(async () => {
        if (camera.current && !isCapturing) {
          setIsCapturing(true);
          try {
            const photo = await camera.current.takePhoto({
              flash: 'off',
              enableShutterSound: false,
            });

            // Convert photo to base64
            const filePath = Platform.OS === 'ios' ? photo.path : photo.path;
            const base64Data = await RNFS.readFile(filePath, 'base64');

            // Clean up the temporary file immediately after reading
            try {
              await RNFS.unlink(filePath);
            } catch (deleteError) {
              console.warn(
                'Failed to delete temporary image file:',
                deleteError,
              );
              // Don't throw - continue with the base64 data even if cleanup fails
            }

            // Create data URL format expected by llama.rn
            const imageBase64 = `data:image/jpeg;base64,${base64Data}`;

            onCapture(imageBase64);
          } catch (error) {
            // Only log error if camera is still supposed to be active
            console.error('Error taking photo or converting to base64:', error);
          } finally {
            setIsCapturing(false);
          }
        }
      }, captureInterval);
    }, [stopCapturing, captureInterval, isCapturing, onCapture]);

    // Start capturing frames at the specified interval
    useEffect(() => {
      if (hasPermission && device) {
        startCapturing();
      }

      return () => {
        stopCapturing();
      };
    }, [hasPermission, device, captureInterval, startCapturing, stopCapturing]);

    const toggleCameraPosition = useCallback(() => {
      setCameraPosition(current => (current === 'back' ? 'front' : 'back'));
    }, []);

    const decreaseInterval = useCallback(() => {
      const newInterval = Math.max(500, captureInterval - 500);
      onCaptureIntervalChange(newInterval);
    }, [captureInterval, onCaptureIntervalChange]);

    const increaseInterval = useCallback(() => {
      const newInterval = Math.min(5000, captureInterval + 500);
      onCaptureIntervalChange(newInterval);
    }, [captureInterval, onCaptureIntervalChange]);

    if (!hasPermission) {
      return (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            {l10n.video.requestingPermission}
          </Text>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    if (!device) {
      return (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            {isSimulator
              ? l10n.simulator.cameraNotAvailable
              : l10n.video.noDevice}
          </Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={l10n.common.close}
            testID="close-button">
            <Icon name="close" style={styles.closeButtonIcon} />
          </TouchableOpacity>
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

        {/* Response overlay */}
        {responseText ? (
          <View style={styles.responseOverlayContainer}>
            <ResponseBubble>
              <Text style={styles.responseText}>{responseText}</Text>
            </ResponseBubble>
          </View>
        ) : null}

        {/* Interval controls */}
        <View style={styles.intervalControlsContainer}>
          <TouchableOpacity
            style={styles.intervalButton}
            onPress={decreaseInterval}
            testID="decrease-interval-button">
            <Text style={styles.intervalButtonText}>-</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.intervalValue}>
              {captureInterval}
              {l10n.video.captureIntervalUnit}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.intervalButton}
            onPress={increaseInterval}
            testID="increase-interval-button">
            <Text style={styles.intervalButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Camera controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={l10n.common.close}
            testID="close-button">
            <Icon name="close" style={styles.closeButtonIcon} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.flipButton}
            onPress={toggleCameraPosition}
            testID="flip-camera-button">
            <Icon name="camera-flip" style={styles.flipButtonIcon} />
          </TouchableOpacity>
        </View>
      </View>
    );
  },
);

export default EmbeddedVideoView;
