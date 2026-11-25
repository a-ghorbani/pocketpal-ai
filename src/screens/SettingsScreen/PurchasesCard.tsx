import React, {useContext, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Platform, View} from 'react-native';

import {useIsFocused} from '@react-navigation/native';
import {observer} from 'mobx-react-lite';
import {Button, Card, Text} from 'react-native-paper';

import {Divider} from '../../components';
import {UndeliverableText} from '../../components/PalsHub';
import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {L10nContext} from '../../utils';
import {authService} from '../../services';
import {ACCOUNT_LINK_ENABLED} from '../../services/iap/accountLink';
import {isStoreBuild} from '../../services/plus/gate';
import {purchaseStore} from '../../store';
import type {LedgerRecord} from '../../store/PurchaseStore';

import {createStyles} from './styles';

interface PurchasesCardProps {
  onSignInPress: () => void;
}

type PlusOutcome = 'unlocked' | 'failed' | 'pending' | 'none';

export const PurchasesCard: React.FC<PurchasesCardProps> = observer(
  ({onSignInPress}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const copy = l10n.settings.purchases;
    const records = purchaseStore.storeOwnedRecords;
    const isReady = purchaseStore.availability === 'ready';
    const [plusOutcome, setPlusOutcome] = useState<PlusOutcome | null>(null);
    const isFocused = useIsFocused();
    const isFocusedRef = useRef(isFocused);

    useEffect(() => {
      isFocusedRef.current = isFocused;
      if (!isFocused) {
        setPlusOutcome(null);
      }
    }, [isFocused]);

    if (!isStoreBuild() || (!isReady && records.length === 0)) {
      return null;
    }

    const statusText = (record: LedgerRecord) => {
      if (
        record.status === 'unfulfillable' ||
        record.status === 'held_invalid'
      ) {
        const text =
          record.status === 'held_invalid' ? (
            l10n.palsScreen.purchase.heldInvalid
          ) : (
            <UndeliverableText record={record} />
          );
        return record.supportCode ? (
          <>
            {text}
            {'\n'}
            {t(l10n.palsScreen.purchase.supportCode, {
              code: record.supportCode,
            })}
          </>
        ) : (
          text
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

    const plusOutcomeText = {
      unlocked: l10n.plus.thanksSubline,
      failed: l10n.plus.restoreFailed,
      pending: l10n.plus.pendingTitle,
      none: l10n.plus.noPurchaseFound,
    };

    const matchesPlusState = (outcome: PlusOutcome) => {
      if (outcome === 'unlocked') {
        return purchaseStore.plusUnlocked;
      }
      if (purchaseStore.plusUnlocked) {
        return false;
      }
      return outcome !== 'pending' || purchaseStore.plusPending;
    };

    const shownOutcome =
      plusOutcome && matchesPlusState(plusOutcome) ? plusOutcome : null;

    const showPlusOutcome = (outcome: PlusOutcome) => {
      if (!isFocusedRef.current) {
        return;
      }
      setPlusOutcome(outcome);
      if (Platform.OS === 'ios') {
        AccessibilityInfo.announceForAccessibility(plusOutcomeText[outcome]);
      }
    };

    const handleRestore = async () => {
      setPlusOutcome(null);
      try {
        const {queryOk} = await purchaseStore.restore();
        if (purchaseStore.plusUnlocked) {
          showPlusOutcome('unlocked');
        } else if (!queryOk) {
          showPlusOutcome('failed');
        } else if (purchaseStore.plusPending) {
          showPlusOutcome('pending');
        } else {
          showPlusOutcome('none');
        }
      } catch {
        showPlusOutcome(purchaseStore.plusUnlocked ? 'unlocked' : 'failed');
      }
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
                style={styles.switchContainer}
                testID={`purchase-row-${record.palId}`}>
                <View style={styles.textContainer}>
                  <Text variant="titleMedium" style={styles.textLabel}>
                    {record.title}
                  </Text>
                  <Text variant="labelSmall" style={styles.textDescription}>
                    {statusText(record)}
                  </Text>
                </View>
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
                onPress={handleRestore}
                loading={purchaseStore.isRestoring}
                disabled={purchaseStore.isRestoring}
                style={styles.menuButton}>
                {l10n.palsScreen.purchase.restorePurchases}
              </Button>
            )}
            {shownOutcome && (
              <Text
                testID="settings-restore-plus-outcome"
                variant="labelSmall"
                style={styles.textDescription}
                accessibilityLiveRegion="polite">
                {plusOutcomeText[shownOutcome]}
              </Text>
            )}
            {ACCOUNT_LINK_ENABLED && purchaseStore.needsLink && (
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
