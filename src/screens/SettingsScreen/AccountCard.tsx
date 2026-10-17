import React, {useContext, useEffect, useRef, useState} from 'react';
import {Alert, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {Button, Card} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {L10nContext} from '../../utils';
import {authService} from '../../services';
import {deleteAccount} from '../../services/palshub/accountDeletion';
import type {DeleteAccountOutcome} from '../../services/palshub/accountApi';

import {createStyles} from './styles';

export const AccountCard: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const copy = l10n.settings.account;
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!authService.isAuthenticated) {
    return null;
  }

  const outcomeMessage = (outcome: DeleteAccountOutcome): string | null => {
    switch (outcome.kind) {
      case 'deleted':
        return copy.deleted;
      case 'sign_in_again':
        return copy.signInAgain;
      case 'creator':
        return t(copy.creatorSupport, {contact: outcome.contact});
      case 'failed':
        return copy.failed;
      case 'cancelled':
        return null;
    }
  };

  const confirmWithoutApple = () =>
    new Promise<boolean>(resolve =>
      Alert.alert(copy.deleteAccount, copy.confirmWithoutApple, [
        {
          text: l10n.common.cancel,
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: l10n.common.delete,
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ]),
    );

  const confirmDelete = async () => {
    setDeleting(true);
    const outcome = await deleteAccount({confirmWithoutApple});
    if (mounted.current) {
      setDeleting(false);
    }
    const message = outcomeMessage(outcome);
    if (message) {
      Alert.alert(copy.deleteAccount, message);
    }
  };

  const handlePress = () =>
    Alert.alert(copy.confirmTitle, copy.confirmMessage, [
      {text: l10n.common.cancel, style: 'cancel'},
      {text: l10n.common.delete, style: 'destructive', onPress: confirmDelete},
    ]);

  return (
    <Card elevation={0} style={styles.card} testID="account-card">
      <Card.Title title={copy.title} />
      <Card.Content>
        <View style={styles.settingItemContainer}>
          <Button
            testID="settings-delete-account"
            mode="outlined"
            textColor={theme.colors.error}
            onPress={handlePress}
            loading={deleting}
            disabled={deleting}
            style={styles.menuButton}>
            {copy.deleteAccount}
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
});
