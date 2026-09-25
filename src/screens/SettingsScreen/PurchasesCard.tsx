import React, {useContext} from 'react';
import {Platform, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {Button, Card, Text} from 'react-native-paper';

import {Divider} from '../../components';
import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {L10nContext} from '../../utils';
import {authService} from '../../services';
import {purchaseStore} from '../../store';
import type {LedgerRecord} from '../../store/PurchaseStore';

import {createStyles} from './styles';

interface PurchasesCardProps {
  onSignInPress: () => void;
}

export const PurchasesCard: React.FC<PurchasesCardProps> = observer(
  ({onSignInPress}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const copy = l10n.settings.purchases;
    const records = purchaseStore.storeOwnedRecords;
    const isReady = purchaseStore.availability === 'ready';

    if (!isReady && records.length === 0) {
      return null;
    }

    const statusText = (record: LedgerRecord) => {
      if (record.status === 'unfulfillable') {
        return t(
          Platform.OS === 'android'
            ? l10n.palsScreen.purchase.unfulfillableRefunded
            : l10n.palsScreen.purchase.unfulfillable,
          {
            code: record.supportCode ?? '',
          },
        );
      }
      const status =
        record.status === 'active' ? copy.statusOwned : copy.statusUnlocking;
      return record.supportCode
        ? `${status} · ${t(l10n.palsScreen.purchase.supportCode, {
            code: record.supportCode,
          })}`
        : status;
    };

    const handleLink = () => {
      if (authService.isAuthenticated) {
        purchaseStore.link();
      } else {
        purchaseStore.requestLink();
        onSignInPress();
      }
    };

    return (
      <Card elevation={0} style={styles.card} testID="purchases-card">
        <Card.Title title={copy.title} />
        <Card.Content>
          <View style={styles.settingItemContainer}>
            {records.map(record => (
              <View
                key={record.palId}
                style={styles.textContainer}
                testID={`purchase-row-${record.palId}`}>
                <Text variant="titleMedium" style={styles.textLabel}>
                  {record.title}
                </Text>
                <Text variant="labelSmall" style={styles.textDescription}>
                  {statusText(record)}
                </Text>
              </View>
            ))}
            {records.length > 0 && <Divider style={styles.divider} />}
            {purchaseStore.linkConflict && (
              <Text variant="labelSmall" style={styles.textDescription}>
                {l10n.palsScreen.purchase.linkConflict}
              </Text>
            )}
            {isReady && (
              <Button
                testID="settings-restore-purchases"
                mode="outlined"
                onPress={() => purchaseStore.restore()}
                loading={purchaseStore.isRestoring}
                disabled={purchaseStore.isRestoring}
                style={styles.menuButton}>
                {l10n.palsScreen.purchase.restorePurchases}
              </Button>
            )}
            {purchaseStore.needsLink && (
              <Button
                testID="settings-link-purchases"
                mode="text"
                onPress={handleLink}
                style={styles.menuButton}>
                {copy.link}
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  },
);
