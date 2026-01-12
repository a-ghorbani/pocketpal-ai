import React from 'react';
import {View} from 'react-native';
import {Portal, Snackbar, Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';
import {ErrorState} from '../../utils/errors';
import {createStyles} from './styles';

interface ErrorSnackbarProps {
  error: ErrorState | null;
  onDismiss: () => void;
  onRetry?: () => void;
  onSettings?: () => void;
  onReport?: () => void;
}

export const ErrorSnackbar: React.FC<ErrorSnackbarProps> = ({
  error,
  onDismiss,
  onRetry,
  onSettings,
  onReport,
}) => {
  const theme = useTheme();

  if (!error) {
    return null;
  }

  const styles = createStyles(theme);

  // Get the appropriate icon based on error code and service
  const getIcon = () => {
    // Service-specific icons for auth errors
    if (error.code === 'authentication' || error.code === 'authorization') {
      switch (error.service) {
        case 'huggingface':
          return 'key-alert'; // Specific icon for HF auth issues
        case 'firebase':
          return 'firebase'; // Firebase-specific icon
        default:
          return 'shield-alert-outline'; // Generic auth icon
      }
    }

    // For other error types
    switch (error.code) {
      case 'network':
        return 'wifi-off';
      case 'storage':
        return 'harddisk-remove';
      case 'server':
        return 'server-off';
      case 'multimodal':
        return 'image-off-outline';
      default:
        return 'alert-circle-outline';
    }
  };

  // Determine the appropriate action based on error type, context, and service
  const getAction = () => {
    // For auth errors, customize based on service
    if (
      (error.code === 'authentication' || error.code === 'authorization') &&
      onSettings
    ) {
      const label = error.service === 'huggingface' ? 'Add Token' : 'Settings';

      return {
        label,
        onPress: onSettings,
        labelStyle: {color: theme.colors.secondary},
      };
    }

    // For model init errors, show report option
    if (error.context === 'modelInit' && onReport) {
      return {
        label: 'Report',
        onPress: onReport,
        labelStyle: {color: theme.colors.secondary},
      };
    }

    // For recoverable errors, show retry button
    if (error.recoverable && onRetry) {
      return {
        label: 'Retry',
        onPress: onRetry,
        labelStyle: {color: theme.colors.secondary},
      };
    }

    // Default action is just to dismiss
    return {
      label: 'Dismiss',
      onPress: onDismiss,
      labelStyle: {color: theme.colors.secondary},
    };
  };

  // Calculate duration based on error type and severity
  const getDuration = () => {
    if (error.severity === 'warning') {
      return 8000; // 8 seconds for warnings
    }
    if (
      error.code === 'authentication' ||
      error.code === 'authorization' ||
      error.code === 'storage'
    ) {
      return 20000; // 20 seconds for critical errors
    }
    return 10000; // 10 seconds for regular errors
  };

  // Get the appropriate icon color based on severity
  const getIconColor = () => {
    if (error.severity === 'warning') {
      return theme.colors.onSurfaceVariant; // More subtle color for warnings
    }
    return theme.colors.error; // Standard error color
  };

  return (
    <Portal>
      <Snackbar
        testID="error-snackbar"
        visible={true}
        onDismiss={onDismiss}
        duration={getDuration()}
        style={styles.snackbar}
        wrapperStyle={styles.wrapper} // Ensure it's above everything
        action={getAction()}>
        <View style={styles.content}>
          <Icon
            testID={`icon-${getIcon()}`}
            name={getIcon()}
            size={20}
            color={getIconColor()}
            style={styles.icon}
          />
          <Text style={styles.message}>{error.message}</Text>
        </View>
      </Snackbar>
    </Portal>
  );
};
