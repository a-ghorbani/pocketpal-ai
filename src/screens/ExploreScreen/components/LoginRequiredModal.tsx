import React, {useContext} from 'react';
import {Text, View} from 'react-native';

import {Button, Dialog} from '../../../components/ui';
import {UserCircleIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {createSheetStyles} from './styles';

interface LoginRequiredModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSignInPress?: () => void;
}

export const LoginRequiredModal: React.FC<LoginRequiredModalProps> = ({
  isVisible,
  onClose,
  onSignInPress,
}) => {
  const theme = useTheme();
  const styles = createSheetStyles(theme);
  const l10n = useContext(L10nContext);

  return (
    <Dialog
      testID="explore-login-required"
      isVisible={isVisible}
      onDismiss={onClose}
      dismissAccessibilityLabel={l10n.common.dismiss}
      align="center">
      <View style={styles.loginBody}>
        <View style={styles.loginIcon}>
          <UserCircleIcon stroke={theme.colors.onSecondaryContainer} />
        </View>
        <Text style={styles.loginTitle}>{l10n.explore.loginRequiredTitle}</Text>
        <Text style={styles.loginMessage}>
          {l10n.explore.loginRequiredMessage}
        </Text>
        <Button
          testID="explore-login-action"
          label={l10n.explore.loginRequiredAction}
          onPress={() => {
            onClose();
            onSignInPress?.();
          }}
        />
      </View>
    </Dialog>
  );
};
