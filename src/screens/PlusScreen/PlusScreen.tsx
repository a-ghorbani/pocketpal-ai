import React, {useContext, useState} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  type HostInstance,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {observer} from 'mobx-react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  AlertIcon,
  CheckBoldIcon,
  ClockFastForwardIcon,
  HeartIcon,
  InfoCircleIcon,
  SparkleFilledIcon,
  XIcon,
} from '../../assets/icons';
import {LicenseNotice} from '../../components/LicenseNotice';
import {APPLE_EULA_URL, REPO_URL} from '../../config/urls';
import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {purchaseStore} from '../../store';
import {L10nContext} from '../../utils';
import {anyRunnable} from '../../services/plus/features';
import type {PlusFeatureRow} from '../../services/plus/features';
import {deviceRam} from '../../services/plus/deviceRam';
import {plusFeatureRows} from '../../services/plus/shipped';

import {plusScreenState} from './plusScreenState';
import {createStyles} from './styles';

const COMPACT_HEIGHT = 760;
const INFO_HIT_SLOP = {top: 15, bottom: 15, left: 15, right: 15};

type RestoreNote = 'none' | 'failed' | null;

const announce = (text: string) => {
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibility(text);
  }
};

interface PlusScreenProps {
  onClose: () => void;
  headlineRef?: React.Ref<HostInstance>;
}

export const PlusScreen: React.FC<PlusScreenProps> = observer(props => {
  const {onClose, headlineRef} = props;
  const {height} = useWindowDimensions();
  const theme = useTheme();
  const styles = createStyles(theme, height < COMPACT_HEIGHT);
  const insets = useSafeAreaInsets();
  const l10n = useContext(L10nContext);
  const copy = l10n.plus;

  const [selectedId, setSelectedId] = useState<string>();
  const [lastBuyFailed, setLastBuyFailed] = useState(false);
  const [restoreNote, setRestoreNote] = useState<RestoreNote>(null);
  const [infoShown, setInfoShown] = useState(false);

  const products = purchaseStore.plusProducts;
  const selected = products.find(product => product.productId === selectedId);
  const rows = plusFeatureRows();
  const state = plusScreenState({
    plusUnlocked: purchaseStore.plusUnlocked,
    plusFlow: purchaseStore.plusFlow,
    plusPending: purchaseStore.plusPending,
    availability: purchaseStore.availability,
    plusChecked: purchaseStore.plusChecked,
    plusProductsLoading: purchaseStore.plusProductsLoading,
    ramBytes: deviceRam.ramBytes,
    productCount: products.length,
    lastBuyFailed,
    showsLicenseNotice: purchaseStore.showsLicenseNotice,
    anyFeatureRunnable: anyRunnable(rows),
  });
  const {phase} = state;
  const {isRestoring} = purchaseStore;
  const purchased = phase === 'purchased';
  const paying = phase === 'paying';
  const showsGrid = phase === 'idle' || paying;

  const handleBuy = async () => {
    if (!selected) {
      return;
    }
    setRestoreNote(null);
    const result = await purchaseStore.buyPlus(selected.productId);
    setLastBuyFailed(result === 'error');
    if (result === 'error') {
      announce(copy.buyError);
    }
    if (result === 'pending') {
      announce(copy.pendingTitle);
    }
  };

  const showRestoreNote = (note: 'none' | 'failed') => {
    setRestoreNote(note);
    announce(note === 'none' ? copy.noPurchaseFound : copy.restoreFailed);
  };

  const handleRestore = async () => {
    setRestoreNote(null);
    try {
      const {queryOk} = await purchaseStore.restore();
      if (purchaseStore.plusUnlocked) {
        return;
      }
      if (!queryOk) {
        showRestoreNote('failed');
      } else if (!purchaseStore.plusPending) {
        showRestoreNote('none');
      }
    } catch {
      showRestoreNote('failed');
    }
  };

  const toggleInfo = () => {
    if (!infoShown) {
      announce(copy.inDevelopment);
    }
    setInfoShown(!infoShown);
  };

  const statusView = (row: PlusFeatureRow) => {
    if (row.status === 'ready') {
      return (
        <View style={styles.status}>
          <CheckBoldIcon
            width={14}
            height={14}
            stroke={theme.colors.btnReadyText}
          />
          <Text style={[styles.statusText, styles.statusReady]}>
            {copy.ready}
          </Text>
        </View>
      );
    }
    if (row.status === 'optIn') {
      return (
        <View style={styles.status}>
          <Text style={styles.statusText}>{copy.optIn}</Text>
        </View>
      );
    }
    if (row.status === 'soon') {
      return (
        <View style={styles.status}>
          <Text style={styles.statusText}>{copy.comingSoon}</Text>
          <Pressable
            testID={`plus-info-${row.id}`}
            accessibilityRole="button"
            accessibilityLabel={copy.inDevelopment}
            accessibilityState={{expanded: infoShown}}
            hitSlop={INFO_HIT_SLOP}
            onPress={toggleInfo}>
            <InfoCircleIcon
              width={15}
              height={15}
              stroke={theme.colors.onSurfaceVariant}
            />
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.status}>
        <Text style={styles.statusText}>
          {t(copy.needsRam, {gb: String(row.status.needsGb)})}
        </Text>
      </View>
    );
  };

  const subline = purchased
    ? copy.thanksSubline
    : state.unsupported
      ? copy.unsupportedSubline
      : copy.subline;

  const notice = (
    testID: string,
    title: string,
    body: string,
    icon: React.ReactNode,
  ) => (
    <View style={styles.notice}>
      {icon}
      <View style={styles.noticeBody}>
        <Text
          testID={testID}
          style={styles.noticeText}
          accessibilityLiveRegion="polite">
          {title}
        </Text>
        <Text style={styles.noticeSub}>{body}</Text>
      </View>
    </View>
  );

  const ctaLabel = () => {
    if (paying) {
      return copy.loading;
    }
    if (!selected) {
      return copy.chooseAmount;
    }
    const price = selected.displayPrice;
    return state.unsupported
      ? t(copy.getPlusAnyway, {price})
      : t(copy.getPlus, {price});
  };

  const cta = () => {
    if (purchased) {
      return (
        <Pressable
          key="done"
          testID="plus-done"
          accessibilityRole="button"
          accessibilityLabel={copy.done}
          onPress={onClose}
          style={styles.primaryBtn}>
          <Text style={styles.primaryLabel}>{copy.done}</Text>
        </Pressable>
      );
    }
    if (phase === 'pending') {
      return (
        <Pressable
          key="pending"
          testID="plus-cta"
          accessibilityRole="button"
          accessibilityLabel={copy.pending}
          accessibilityState={{disabled: true}}
          disabled
          style={[styles.primaryBtn, styles.primaryBtnBusy]}>
          <Text style={[styles.primaryLabel, styles.primaryLabelBusy]}>
            {copy.pending}
          </Text>
        </Pressable>
      );
    }
    if (phase === 'loading') {
      return (
        <View
          testID="plus-loading"
          style={[styles.primaryBtn, styles.primaryBtnBusy]}>
          <ActivityIndicator
            accessibilityLabel={copy.loading}
            color={theme.colors.onBackground}
          />
        </View>
      );
    }
    if (!showsGrid) {
      return null;
    }
    const disabled = paying || !selected;
    return (
      <Pressable
        key="buy"
        testID="plus-cta"
        accessibilityRole="button"
        accessibilityLabel={ctaLabel()}
        accessibilityState={{busy: paying, disabled}}
        disabled={disabled}
        onPress={handleBuy}
        style={[styles.primaryBtn, disabled && styles.primaryBtnBusy]}>
        {paying ? (
          <ActivityIndicator color={theme.colors.onBackground} />
        ) : (
          <Text
            style={[styles.primaryLabel, disabled && styles.primaryLabelBusy]}>
            {ctaLabel()}
          </Text>
        )}
      </Pressable>
    );
  };

  const restoreLink = (
    <Pressable
      testID="plus-restore"
      accessibilityRole="button"
      accessibilityLabel={copy.restore}
      accessibilityState={{disabled: isRestoring || paying, busy: isRestoring}}
      disabled={isRestoring || paying}
      onPress={handleRestore}
      style={styles.footerHit}>
      {isRestoring && (
        <ActivityIndicator
          testID="plus-restore-busy"
          size="small"
          color={theme.colors.secondary}
        />
      )}
      <Text style={styles.footerLink}>{copy.restore}</Text>
    </Pressable>
  );

  const afterDot = (item: React.ReactNode) => (
    <View style={styles.footerGroup}>
      <Text style={styles.footerDot}>·</Text>
      {item}
    </View>
  );

  return (
    <View testID="plus-screen" style={[styles.root, {paddingTop: insets.top}]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingBottom: insets.bottom + theme.spacing.s},
        ]}
        bounces={false}>
        <View style={styles.topBar}>
          <View style={styles.eyebrow}>
            <SparkleFilledIcon
              width={14}
              height={14}
              fill={theme.colors.secondary}
            />
            <Text style={styles.eyebrowText}>{copy.eyebrow}</Text>
          </View>
          <Pressable
            testID="plus-close"
            accessibilityRole="button"
            accessibilityLabel={l10n.common.close}
            onPress={onClose}
            style={styles.closeBtn}>
            <XIcon width={22} height={22} stroke={theme.colors.onBackground} />
          </Pressable>
        </View>

        <View style={styles.header}>
          {purchased && (
            <View style={styles.thanksBadge}>
              <HeartIcon
                width={24}
                height={24}
                stroke={theme.colors.secondary}
              />
            </View>
          )}
          <Text
            ref={headlineRef}
            accessibilityRole="header"
            style={styles.headline}>
            {purchased ? copy.thanksHeadline : copy.headline}
          </Text>
          <Text style={styles.subline}>{subline}</Text>
        </View>

        <View style={styles.features}>
          {rows.map((row, index) => (
            <View key={row.id} testID={`plus-feature-${row.id}`}>
              {index > 0 && <View style={styles.featureDivider} />}
              <View style={styles.featureRow}>
                <View style={styles.featureText}>
                  <Text
                    style={[
                      styles.featureName,
                      row.status !== 'ready' && styles.featureNameMuted,
                    ]}>
                    {copy.features[row.id]}
                  </Text>
                  {row.status === 'optIn' && (
                    <Text
                      testID={`plus-feature-note-${row.id}`}
                      style={styles.featureNote}>
                      {row.reason === 'offInSettings'
                        ? copy.offInSettingsNote
                        : copy.optInNote}
                    </Text>
                  )}
                </View>
                {statusView(row)}
              </View>
            </View>
          ))}
        </View>
        {infoShown ? (
          <Text
            key="in-development"
            style={styles.speedLine}
            accessibilityLiveRegion="polite">
            {copy.inDevelopment}
          </Text>
        ) : (
          <Text key="speed" style={styles.speedLine}>
            {copy.speedLine}
          </Text>
        )}

        {phase === 'pending' &&
          notice(
            'plus-pending-notice',
            copy.pendingTitle,
            copy.pendingBody,
            <ClockFastForwardIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurfaceVariant}
            />,
          )}
        {phase === 'unavailable' &&
          notice(
            'plus-unavailable-notice',
            copy.unavailableTitle,
            copy.unavailableBody,
            <AlertIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurfaceVariant}
            />,
          )}

        {showsGrid && (
          <>
            <Text testID="plus-free-line" style={styles.priceCaption}>
              {copy.chatStaysFree}
            </Text>
            {state.error ? (
              <View style={styles.inlineError}>
                <AlertIcon width={16} height={16} stroke={theme.colors.error} />
                <Text
                  testID="plus-error-line"
                  style={styles.inlineErrorText}
                  accessibilityLiveRegion="polite">
                  {copy.buyError}
                </Text>
              </View>
            ) : (
              <Text style={styles.priceCaption}>{copy.priceCaption}</Text>
            )}
            <View accessibilityRole="radiogroup" style={styles.grid}>
              {products.map(product => {
                const checked = product.productId === selected?.productId;
                return (
                  <Pressable
                    key={product.productId}
                    testID={`plus-tile-${product.productId}`}
                    accessibilityRole="radio"
                    accessibilityState={{checked, disabled: paying}}
                    disabled={paying}
                    onPress={() => setSelectedId(product.productId)}
                    style={[styles.tile, checked && styles.tileSelected]}>
                    <Text style={styles.tileText}>{product.displayPrice}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {state.licence && (
          <LicenseNotice
            TextComponent={Text}
            testID="plus-licence"
            style={styles.licence}
            linkStyle={styles.footerLink}
            notice={copy.licence}
            firstLink={{label: copy.terms, url: APPLE_EULA_URL}}
            appleTermsLabel={copy.appleMediaTerms}
          />
        )}

        {cta()}

        {!purchased && restoreNote && (
          <Text
            testID="plus-restore-note"
            style={styles.restoreNote}
            accessibilityLiveRegion="polite">
            {restoreNote === 'none' ? copy.noPurchaseFound : copy.restoreFailed}
          </Text>
        )}

        {!purchased && (
          <View testID="plus-footer" style={styles.footer}>
            {!state.licence && (
              <Text style={styles.footerText}>{copy.oneTimePurchase}</Text>
            )}
            {state.licence ? restoreLink : afterDot(restoreLink)}
            {afterDot(
              <Pressable
                testID="plus-open-source"
                accessibilityRole="link"
                onPress={() => Linking.openURL(REPO_URL)}
                style={styles.footerHit}>
                <Text style={styles.footerLink}>{copy.openSource}</Text>
              </Pressable>,
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
});
