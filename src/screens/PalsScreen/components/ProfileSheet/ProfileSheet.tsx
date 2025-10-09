import React, {useContext} from 'react';
import {View, Alert} from 'react-native';
import {Text, Button, Divider} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {UserIcon, LockIcon} from '../../../../assets/icons';

import {useTheme} from '../../../../hooks';
import {L10nContext} from '../../../../utils';
import {Sheet} from '../../../../components';
import {createStyles} from './styles';

import {authService} from '../../../../services';

interface ProfileSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSignInPress: () => void;
}

export const ProfileSheet: React.FC<ProfileSheetProps> = observer(
  ({isVisible, onClose, onSignInPress}) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const handleSignOut = () => {
      Alert.alert(
        l10n.palsScreen.signOut,
        l10n.palsScreen.signOutConfirmation,
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.palsScreen.signOut,
            style: 'destructive',
            onPress: async () => {
              try {
                await authService.signOut();
                onClose();
              } catch (error) {
                console.error('Error signing out:', error);
                Alert.alert(
                  l10n.errors.unexpectedError,
                  l10n.palsScreen.signOutError,
                );
              }
            },
          },
        ],
      );
    };

    const renderAuthenticatedContent = () => {
      const user = authService.user;
      const userName = user?.user_metadata?.name || user?.email || 'User';

      return (
        <View style={styles.content}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <UserIcon
                stroke={theme.colors.onPrimaryContainer}
                width={32}
                height={32}
              />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{userName}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.actions}>
            <Text style={styles.sectionTitle}>{l10n.palsScreen.account}</Text>

            <Button
              mode="outlined"
              onPress={handleSignOut}
              style={styles.actionButton}
              icon={() => (
                <LockIcon
                  stroke={theme.colors.onSurfaceVariant}
                  width={18}
                  height={18}
                />
              )}>
              {l10n.palsScreen.signOut}
            </Button>
          </View>
        </View>
      );
    };

    const renderUnauthenticatedContent = () => (
      <View style={styles.content}>
        <View style={styles.signInPrompt}>
          <UserIcon
            stroke={theme.colors.onSurfaceVariant}
            width={48}
            height={48}
          />
          <Text style={styles.signInTitle}>
            {l10n.palsScreen.signInToPalsHub}
          </Text>
          <Text style={styles.signInDescription}>
            {l10n.palsScreen.signInDescription}
          </Text>

          <Button
            mode="contained"
            onPress={() => {
              onClose();
              onSignInPress();
            }}
            style={styles.signInButton}>
            {l10n.palsScreen.signIn}
          </Button>
        </View>
      </View>
    );

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onClose}
        title={
          authService.isAuthenticated
            ? l10n.palsScreen.profile
            : l10n.palsScreen.account
        }>
        <Sheet.ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + 16,
          }}>
          {authService.isAuthenticated
            ? renderAuthenticatedContent()
            : renderUnauthenticatedContent()}
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);
