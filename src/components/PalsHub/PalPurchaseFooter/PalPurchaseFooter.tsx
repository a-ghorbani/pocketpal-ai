import React, {useContext, useEffect, useRef, useState} from 'react';
import {Alert, Linking, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {ActivityIndicator, Button, Text} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import {t} from '../../../locales';
import {L10nContext} from '../../../utils';
import {authService} from '../../../services';
import {ACCOUNT_LINK_ENABLED} from '../../../services/iap/accountLink';
import {palStore, purchaseStore} from '../../../store';
import type {PalsHubPal} from '../../../types/palshub';
import type {PendingUpdate} from '../../../store/PurchaseStore';

import {PalModelStep} from '../PalModelStep';
import {UndeliverableText} from '../UndeliverableText';
import {createStyles} from './styles';

const TERMS_OF_SALE_URL = 'https://palshub.ai/legal/terms-of-sale';
const APPLE_MEDIA_TERMS_URL =
  'https://www.apple.com/legal/internet-services/itunes/us/terms.html';

interface PalPurchaseFooterProps {
  pal: PalsHubPal;
  onClose: () => void;
  onSignInPress?: () => void;
}

export const PalPurchaseFooter: React.FC<PalPurchaseFooterProps> = observer(
  ({pal, onClose, onSignInPress}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const copy = l10n.palsScreen.purchase;
    const [showModelStep, setShowModelStep] = useState(false);
    const [isOpening, setIsOpening] = useState(false);
    const [linkPromptDismissed, setLinkPromptDismissed] = useState(false);
    const [confirmingUpdate, setConfirmingUpdate] = useState<string>();
    const [applyingUpdate, setApplyingUpdate] = useState(false);
    const applying = useRef(false);

    useEffect(() => () => purchaseStore.endSession(pal.id), [pal.id]);

    const phase = purchaseStore.flowFor(pal.id);
    const record = purchaseStore.recordFor(pal.id);
    const product = purchaseStore.productFor(pal.store_product_id);
    const canBuy = purchaseStore.canBuy(pal);
    const owned = purchaseStore.isOwned(pal.id) || pal.is_owned === true;
    const localPal = palStore.pals.find(p => p.palshub_id === pal.id);
    const signedIn = authService.isAuthenticated;
    const pendingUpdate = purchaseStore.updateAvailable(pal.id)
      ? record?.pendingUpdate
      : undefined;

    const handleLinkSignIn = () => {
      purchaseStore.requestLink();
      onSignInPress?.();
    };

    const handleBuy = async () => {
      if ((await purchaseStore.buy(pal)) === 'close') {
        onClose();
      }
    };

    const alertError = (error: unknown) =>
      Alert.alert(
        l10n.palsScreen.palDetailSheet.error,
        error instanceof Error
          ? error.message
          : l10n.palsScreen.palDetailSheet.failedToDownload,
      );

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
        alertError(error);
      } finally {
        setIsOpening(false);
      }
    };

    const handleConfirmUpdate = async (shownVersion: string) => {
      if (applying.current) {
        return;
      }
      applying.current = true;
      setApplyingUpdate(true);
      try {
        await purchaseStore.applyUpdate(pal.id, shownVersion);
      } catch (error) {
        alertError(error);
      } finally {
        applying.current = false;
        setApplyingUpdate(false);
        setConfirmingUpdate(undefined);
      }
    };

    const status = (message: string, testID: string) => (
      <Text testID={testID} style={styles.status}>
        {message}
      </Text>
    );

    const progress = (testID: string) => (
      <ActivityIndicator testID={testID} accessibilityLabel={copy.unlocking} />
    );

    const buyButton = (
      <>
        {purchaseStore.showsLicenseNotice && (
          <Text testID="purchase-license-notice" style={styles.status}>
            {copy.licenseNotice}{' '}
            <Text
              testID="purchase-terms-of-sale-link"
              accessibilityRole="link"
              style={styles.link}
              onPress={() => Linking.openURL(TERMS_OF_SALE_URL)}>
              {copy.termsOfSale}
            </Text>
            {' · '}
            <Text
              testID="purchase-apple-terms-link"
              accessibilityRole="link"
              style={styles.link}
              onPress={() => Linking.openURL(APPLE_MEDIA_TERMS_URL)}>
              {copy.appleMediaTerms}
            </Text>
          </Text>
        )}
        <Button
          testID="buy-button"
          mode="contained"
          onPress={handleBuy}
          style={styles.button}>
          {t(copy.buy, {price: product?.displayPrice ?? ''})}
        </Button>
        {!signedIn && onSignInPress && (
          <Button
            testID="purchase-signin-link"
            mode="text"
            compact
            onPress={onSignInPress}>
            {copy.signInLine}
          </Button>
        )}
      </>
    );

    const offerLink =
      ACCOUNT_LINK_ENABLED &&
      !signedIn &&
      !linkPromptDismissed &&
      onSignInPress;
    const linkPrompt = offerLink && (
      <View style={styles.prompt} testID="purchase-link-prompt">
        <Text style={styles.status}>{copy.linkPrompt}</Text>
        <View style={styles.promptActions}>
          <Button
            testID="purchase-link-dismiss"
            mode="text"
            compact
            onPress={() => setLinkPromptDismissed(true)}>
            {copy.dismiss}
          </Button>
          <Button
            testID="purchase-link-signin"
            mode="text"
            compact
            onPress={handleLinkSignIn}>
            {copy.linkSignIn}
          </Button>
        </View>
      </View>
    );

    const linkConflict =
      purchaseStore.linkConflict &&
      status(copy.linkConflict, 'purchase-link-conflict');

    const renderUpdate = ({contentVersion, changeNote}: PendingUpdate) =>
      confirmingUpdate === contentVersion ? (
        <>
          {status(copy.updateConfirmText, 'pal-update-confirm-text')}
          <View style={styles.promptActions}>
            <Button
              testID="pal-update-cancel"
              mode="text"
              onPress={() => setConfirmingUpdate(undefined)}
              disabled={applyingUpdate}>
              {copy.updateCancel}
            </Button>
            <Button
              testID="pal-update-confirm"
              mode="contained"
              onPress={() => handleConfirmUpdate(contentVersion)}
              loading={applyingUpdate}
              disabled={applyingUpdate}>
              {copy.updateConfirm}
            </Button>
          </View>
        </>
      ) : (
        <>
          {status(
            changeNote
              ? t(copy.updatePromptWithNote, {note: changeNote})
              : copy.updatePrompt,
            'pal-update-prompt',
          )}
          <Button
            testID="pal-update-button"
            mode="outlined"
            onPress={() => setConfirmingUpdate(contentVersion)}
            style={styles.button}>
            {copy.updateButton}
          </Button>
        </>
      );

    const renderBody = () => {
      switch (phase) {
        case 'ready':
          return (
            <View style={styles.group} testID="purchase-ready">
              {localPal && (
                <PalModelStep localPal={localPal} onChatStarted={onClose} />
              )}
              {linkPrompt}
              {linkConflict}
            </View>
          );
        case 'pending_payment':
          return status(copy.pending, 'purchase-pending');
        case 'unlocking':
          return (
            <>
              {progress('purchase-unlocking')}
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
          return progress('purchase-installing');
        case 'unfulfillable':
          return (
            <>
              <Text testID="purchase-unfulfillable" style={styles.status}>
                <UndeliverableText record={record} />
              </Text>
              {record?.supportCode &&
                status(
                  t(copy.supportCode, {code: record.supportCode}),
                  'purchase-support-code',
                )}
            </>
          );
        case 'held_invalid':
          return (
            <>
              {status(copy.heldInvalid, 'purchase-held-invalid')}
              {record?.supportCode &&
                status(
                  t(copy.supportCode, {code: record.supportCode}),
                  'purchase-support-code',
                )}
              <Button
                testID="purchase-restore-button"
                mode="outlined"
                onPress={() => purchaseStore.restore()}
                loading={purchaseStore.isRestoring}
                disabled={purchaseStore.isRestoring}
                style={styles.button}>
                {copy.restorePurchases}
              </Button>
            </>
          );
        case 'invalid':
          return (
            <>
              {status(copy.invalid, 'purchase-invalid')}
              {canBuy && buyButton}
            </>
          );
        case 'restore_needed':
          return (
            <View style={styles.group} testID="purchase-restore-needed">
              <Button
                testID="purchase-restore-button"
                mode="outlined"
                onPress={() => purchaseStore.restore()}
                loading={purchaseStore.isRestoring}
                disabled={purchaseStore.isRestoring}
                style={styles.button}>
                {copy.restorePurchases}
              </Button>
            </View>
          );
      }
      if (showModelStep && localPal) {
        return <PalModelStep localPal={localPal} onChatStarted={onClose} />;
      }
      if (owned) {
        return (
          <>
            <Button
              testID="owned-button"
              mode="contained"
              onPress={handleOwned}
              loading={isOpening}
              disabled={isOpening}
              style={styles.button}>
              {localPal ? copy.open : copy.install}
            </Button>
            {pendingUpdate && renderUpdate(pendingUpdate)}
          </>
        );
      }
      if (phase === 'paying') {
        return progress('purchase-paying');
      }
      if (canBuy) {
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
