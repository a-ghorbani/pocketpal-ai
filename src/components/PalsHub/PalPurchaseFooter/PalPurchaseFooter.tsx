import React, {useContext, useEffect, useState} from 'react';
import {Alert, Platform, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {ActivityIndicator, Button, Text} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import {t} from '../../../locales';
import {L10nContext} from '../../../utils';
import {palStore, purchaseStore} from '../../../store';
import type {PalsHubPal} from '../../../types/palshub';

import {PalModelStep} from '../PalModelStep';
import {createStyles} from './styles';

interface PalPurchaseFooterProps {
  pal: PalsHubPal;
  onClose: () => void;
  onSignInPress?: () => void;
}

export const PalPurchaseFooter: React.FC<PalPurchaseFooterProps> = observer(
  ({pal, onClose}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const copy = l10n.palsScreen.purchase;
    const [showModelStep, setShowModelStep] = useState(false);
    const [isOpening, setIsOpening] = useState(false);

    useEffect(() => () => purchaseStore.endSession(pal.id), [pal.id]);

    const phase = purchaseStore.flowFor(pal.id);
    const record = purchaseStore.recordFor(pal.id);
    const product = purchaseStore.productFor(pal.store_product_id);
    const canBuy = purchaseStore.canBuy(pal);
    const owned = purchaseStore.isOwned(pal.id) || pal.is_owned === true;
    const localPal = palStore.pals.find(p => p.palshub_id === pal.id);

    const handleBuy = async () => {
      if ((await purchaseStore.buy(pal)) === 'close') {
        onClose();
      }
    };

    const handleOwned = async () => {
      if (localPal) {
        setShowModelStep(true);
        return;
      }
      setIsOpening(true);
      try {
        if (purchaseStore.isStoreOwned(pal.id)) {
          if (await purchaseStore.installOwned(pal)) {
            setShowModelStep(true);
          }
        } else {
          await palStore.downloadPalsHubPal(pal);
          setShowModelStep(true);
        }
      } catch (error) {
        Alert.alert(
          l10n.palsScreen.palDetailSheet.error,
          error instanceof Error
            ? error.message
            : l10n.palsScreen.palDetailSheet.failedToDownload,
        );
      } finally {
        setIsOpening(false);
      }
    };

    const buyButton = (
      <>
        <Button
          testID="buy-button"
          mode="contained"
          onPress={handleBuy}
          loading={phase === 'paying'}
          disabled={phase === 'paying'}
          style={styles.button}>
          {t(copy.buy, {price: product?.displayPrice ?? ''})}
        </Button>
        <Text style={styles.caption}>{copy.oneTime}</Text>
      </>
    );

    const status = (message: string, testID: string) => (
      <Text testID={testID} style={styles.status}>
        {message}
      </Text>
    );

    const renderBody = () => {
      switch (phase) {
        case 'ready':
          return (
            <>
              {status(
                t(Platform.OS === 'ios' ? copy.readyIos : copy.readyAndroid, {
                  name: pal.title,
                }),
                'purchase-ready',
              )}
              {record?.supportCode &&
                status(
                  t(copy.supportCode, {code: record.supportCode}),
                  'purchase-support-code',
                )}
              {localPal && (
                <PalModelStep localPal={localPal} onChatStarted={onClose} />
              )}
            </>
          );
        case 'pending_payment':
          return status(copy.pending, 'purchase-pending');
        case 'unlocking':
          return (
            <>
              {status(copy.unlocking, 'purchase-unlocking')}
              <Button
                testID="purchase-retry-button"
                mode="outlined"
                onPress={() => purchaseStore.retry(pal.id)}
                style={styles.button}>
                {copy.retry}
              </Button>
            </>
          );
        case 'granted':
          return (
            <>
              <ActivityIndicator testID="purchase-installing" />
              {status(copy.installing, 'purchase-installing-text')}
            </>
          );
        case 'unfulfillable':
          return status(
            t(copy.unfulfillable, {code: record?.supportCode ?? ''}),
            'purchase-unfulfillable',
          );
        case 'invalid':
          return (
            <>
              {status(copy.invalid, 'purchase-invalid')}
              {canBuy && buyButton}
            </>
          );
      }
      if (showModelStep && localPal) {
        return <PalModelStep localPal={localPal} onChatStarted={onClose} />;
      }
      if (owned) {
        return (
          <Button
            testID="owned-button"
            mode="contained"
            onPress={handleOwned}
            loading={isOpening}
            disabled={isOpening}
            style={styles.button}>
            {copy.owned}
          </Button>
        );
      }
      if (canBuy || phase === 'paying') {
        return buyButton;
      }
      return null;
    };

    const body = renderBody();
    if (!body) {
      return null;
    }

    return (
      <View style={styles.container} testID="pal-purchase-footer">
        <Text style={styles.name} numberOfLines={1}>
          {pal.title}
        </Text>
        {body}
      </View>
    );
  },
);
