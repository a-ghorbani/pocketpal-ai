import React from 'react';
import {View, Linking} from 'react-native';
import {Text, Portal} from 'react-native-paper';

import {Dialog, DialogAction} from '../Dialog';
import {Model} from '../../utils/types';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {ErrorState} from '../../utils/errors';
import {createStyles} from './styles';
import {CheckCircleIcon} from '../../assets/icons';
import {hfStore} from '../../store';

const CheckIcon = ({color}: {color: string}) => (
  <CheckCircleIcon width={16} height={16} stroke={color} />
);

interface DownloadErrorDialogProps {
  visible: boolean;
  onDismiss: () => void;
  error: ErrorState | null;
  model?: Model;
  onGoToSettings?: () => void;
  onTryAgain?: () => void;
}

export const DownloadErrorDialog: React.FC<DownloadErrorDialogProps> = ({
  visible,
  onDismiss,
  error,
  model,
  onGoToSettings,
  onTryAgain,
}) => {
  const theme = useTheme();
  const l10n = React.useContext(L10nContext);
  const alerts = l10n.components.downloadErrorDialog;

  // Check if this is the case where token exists but is disabled
  const isTokenDisabledWhenAuthError =
    error?.code === 'authentication' &&
    hfStore.isTokenPresent &&
    !hfStore.useHfToken;

  const isTokenPresentWhenAuthError =
    error?.code === 'authentication' &&
    hfStore.isTokenPresent &&
    hfStore.useHfToken;

  const notEnoughSpace = error?.code === 'storage';

  const getErrorType = ():
    | 'unauthorized'
    | 'forbidden'
    | 'noToken'
    | 'other' => {
    if (!error) {
      return 'other';
    }

    if (error.code === 'authentication') {
      if (error.message?.includes('Token is missing')) {
        return 'noToken';
      }
      return 'unauthorized';
    } else if (error.code === 'authorization') {
      return 'forbidden';
    } else if (error.code === 'server') {
      return 'forbidden';
    }
    return 'other';
  };

  const errorType = getErrorType();

  const getDialogTitle = () => {
    if (isTokenDisabledWhenAuthError) {
      return alerts.tokenDisabledTitle;
    }

    if (isTokenPresentWhenAuthError) {
      return alerts.unauthorizedTitle;
    }

    switch (errorType) {
      case 'unauthorized':
        return alerts.unauthorizedTitle;
      case 'forbidden':
        return alerts.forbiddenTitle;
      case 'noToken':
        return alerts.getTokenTitle;
      default:
        return alerts.downloadFailedTitle;
    }
  };

  const getDialogMessage = () => {
    if (isTokenDisabledWhenAuthError) {
      return alerts.tokenDisabledMessage;
    }

    if (isTokenPresentWhenAuthError) {
      return alerts.unauthorizedMessage;
    }

    switch (errorType) {
      case 'unauthorized':
        return alerts.unauthorizedMessage;
      case 'forbidden':
        return alerts.forbiddenMessage;
      case 'noToken':
        return alerts.getTokenMessage;
      default:
        return !error?.message
          ? alerts.downloadFailedMessage.replace('{message}', '')
          : undefined;
    }
  };

  const getSteps = () => {
    if (isTokenDisabledWhenAuthError) {
      return [];
    }

    if (isTokenPresentWhenAuthError) {
      return [];
    }

    switch (errorType) {
      case 'forbidden':
        return alerts.forbiddenSteps;
      case 'noToken':
        return alerts.getTokenSteps;
      default:
        return [];
    }
  };

  const handleEnableToken = () => {
    hfStore.setUseHfToken(true);
    if (onTryAgain) {
      onTryAgain();
    }
  };

  const getActions = () => {
    const actions: DialogAction[] = [];

    if (model?.hfUrl && !isTokenDisabledWhenAuthError && !notEnoughSpace) {
      actions.push({
        label: alerts.viewOnHuggingFace,
        onPress: () => {
          Linking.openURL(model.hfUrl);
        },
        mode: 'text' as const,
      });
    }

    if (
      isTokenDisabledWhenAuthError ||
      isTokenPresentWhenAuthError ||
      notEnoughSpace
    ) {
      actions.push({
        label: l10n.common.dismiss,
        onPress: () => {
          onDismiss();
        },
        mode: 'text' as const,
      });
    }

    if (isTokenDisabledWhenAuthError) {
      actions.push({
        label: alerts.enableAndRetry,
        onPress: handleEnableToken,
        mode: 'contained' as const,
      });
    } else if (
      ['unauthorized', 'forbidden', 'noToken'].includes(errorType) &&
      onGoToSettings
    ) {
      actions.push({
        label: alerts.goToSettings,
        onPress: onGoToSettings,
        mode: 'text' as const,
      });
    }

    if (!isTokenDisabledWhenAuthError && onTryAgain) {
      actions.push({
        label: alerts.tryAgain,
        onPress: onTryAgain,
        mode: 'contained' as const,
      });
    }

    return actions;
  };

  const steps = getSteps();
  const message = getDialogMessage();
  const styles = createStyles(theme);

  return (
    <Portal>
      <Dialog
        testID="download-error-dialog"
        visible={visible}
        onDismiss={onDismiss}
        title={getDialogTitle()}
        actions={getActions()}
        scrollable={true}>
        <View>
          {message && <Text variant="bodyMedium">{message}</Text>}

          {steps.length > 0 && (
            <View style={styles.stepsContainer}>
              {steps.map((step, index) => (
                <View key={index} style={styles.stepItem}>
                  <View style={styles.stepRow}>
                    <CheckIcon color={theme.colors.primary} />
                    <View style={styles.textContainer}>
                      <Text style={styles.stepText}>{step}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {errorType === 'other' && error?.message && (
            <View style={styles.errorDetails}>
              <Text style={styles.errorText} testID="error-message-text">
                {error.message}
              </Text>
            </View>
          )}
        </View>
      </Dialog>
    </Portal>
  );
};
