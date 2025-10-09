import React, {useContext} from 'react';
import {View} from 'react-native';
import {Text, Button, IconButton} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {LockIcon, XIcon} from '../../../../assets/icons';

import {useTheme} from '../../../../hooks';
import {L10nContext} from '../../../../utils';
import {createStyles} from './styles';

interface CompactAuthBarProps {
  isAuthenticated: boolean;
  onSignInPress: () => void;
  onProfilePress: () => void;
  onDismiss: () => void;
  userName?: string;
}

export const CompactAuthBar: React.FC<CompactAuthBarProps> = observer(
  ({isAuthenticated, onSignInPress, onDismiss}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    // Only show for unauthenticated users
    if (isAuthenticated) {
      return null;
    }

    return (
      <View style={styles.container} testID="compact-auth-bar">
        <View style={styles.unauthenticatedContent}>
          <View style={styles.infoSection}>
            <LockIcon
              stroke={theme.colors.onSurfaceVariant}
              width={16}
              height={16}
            />
            <Text style={styles.infoText}>
              {l10n.palsScreen.signInToAccessLibrary}
            </Text>
          </View>
          <View style={styles.actionsSection}>
            <Button
              mode="contained"
              onPress={onSignInPress}
              style={styles.signInButton}
              labelStyle={styles.signInButtonLabel}
              compact
              testID="sign-in-button">
              {l10n.palsScreen.signIn}
            </Button>
            <IconButton
              icon={() => (
                <XIcon
                  stroke={theme.colors.onSurfaceVariant}
                  width={16}
                  height={16}
                />
              )}
              size={20}
              onPress={onDismiss}
              style={styles.dismissButton}
              testID="dismiss-auth-bar"
            />
          </View>
        </View>
      </View>
    );
  },
);
