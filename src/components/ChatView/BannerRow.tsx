import * as React from 'react';
import {AccessibilityInfo, Text, View} from 'react-native';
import {Button as PaperButton, useTheme} from 'react-native-paper';

import {AlertIcon} from '../../assets/icons';
import {t} from '../../locales';
import type {BannerVariant} from '../../utils/bannerVariantResolver';
import type {createStyles} from './styles';

export interface BannerRowProps {
  variant: BannerVariant;
  l10n: any;
  isRunActive: boolean;
  onIncrease: () => void;
  onDismiss: (kind: BannerVariant['kind']) => void;
  onNewChat: () => void;
  styles: ReturnType<typeof createStyles>;
}

interface Tints {
  bg: string;
  border: string;
  fg: string;
  meter: string;
}

const withAlpha = (hex: string, alphaHex: string): string => {
  // Accept #RRGGBB or #RRGGBBAA — last two hex chars are alpha if 9 chars.
  if (hex.length === 9) {
    return hex.slice(0, 7) + alphaHex;
  }
  return hex + alphaHex;
};

const Meter: React.FC<{ratio: number; tint: string; styles: any}> = ({
  ratio,
  tint,
  styles,
}) => (
  <View style={styles.bannerMeter} testID="banner-meter">
    <View
      style={[
        styles.bannerMeterFill,
        {
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          backgroundColor: tint,
        },
      ]}
    />
  </View>
);

/**
 * Inline banner row that renders one of the four visible variants
 * resolved by `resolveBannerVariant`. Each variant gets a tinted
 * background / border / title so the user perceives the severity at a
 * glance, paired with a leading icon.
 */
export const BannerRow: React.FC<BannerRowProps> = ({
  variant,
  l10n,
  isRunActive,
  onIncrease,
  onDismiss,
  onNewChat,
  styles,
}) => {
  const copy = l10n.chat.contextWarning;
  const theme = useTheme();
  const error = theme.colors.error;
  const onSurface = theme.colors.onSurface;
  const outline = theme.colors.outline;

  // iOS parity — accessibilityLiveRegion is Android-only.
  const announcement = React.useMemo(() => {
    if (variant.kind === 'none') {
      return '';
    }
    if (variant.kind === 'html-soft-cap') {
      return l10n.chat.softCapWarning;
    }
    if (variant.kind === 'context-warning') {
      return `${copy.warning.title}. ${copy.warning.message}`;
    }
    if (variant.kind === 'context-full') {
      const titleCopy = variant.escalated
        ? copy.fullEscalated.title
        : variant.heavyTalent
          ? copy.fullHeavyTalent.title
          : copy.full.title;
      const friendlyTalent = variant.heavyTalent
        ? (copy.talentLabels?.[variant.heavyTalent.name] ??
          copy.talentLabels?.fallback ??
          variant.heavyTalent.name)
        : null;
      const messageCopy = variant.escalated
        ? copy.fullEscalated.message
        : friendlyTalent
          ? t(copy.fullHeavyTalent.message, {talentName: friendlyTalent})
          : copy.full.message;
      return `${titleCopy}. ${messageCopy}`;
    }
    return `${copy.remoteHedged.title}. ${copy.remoteHedged.message}`;
  }, [variant, copy, l10n]);
  React.useEffect(() => {
    if (announcement) {
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [announcement, variant.kind]);

  const variantTints: Record<BannerVariant['kind'], Tints> = {
    'context-warning': {
      bg: withAlpha(error, '14'),
      border: withAlpha(error, '40'),
      fg: error,
      meter: error,
    },
    'context-full': {
      bg: withAlpha(error, '22'),
      border: withAlpha(error, '66'),
      fg: error,
      meter: error,
    },
    'context-remote-hedged': {
      bg: theme.colors.surfaceVariant,
      border: outline,
      fg: theme.colors.onSurfaceVariant,
      meter: error,
    },
    'html-soft-cap': {
      bg: theme.colors.surfaceVariant,
      border: outline,
      fg: onSurface,
      meter: error,
    },
    none: {
      bg: 'transparent',
      border: 'transparent',
      fg: onSurface,
      meter: error,
    },
  };

  if (variant.kind === 'html-soft-cap') {
    const tint = variantTints['html-soft-cap'];
    return (
      <View
        testID="soft-cap-warning"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.softCapBanner,
          {backgroundColor: tint.bg, borderColor: tint.border},
        ]}>
        <Text style={styles.softCapBannerText}>{l10n.chat.softCapWarning}</Text>
        <View style={styles.bannerActions}>
          <PaperButton
            mode="text"
            compact
            onPress={() => onDismiss('html-soft-cap')}>
            {copy.warning.dismiss}
          </PaperButton>
        </View>
      </View>
    );
  }

  if (variant.kind === 'context-warning') {
    const tint = variantTints['context-warning'];
    const percent = Math.round(variant.ratio * 100);
    return (
      <View
        testID="context-warning-banner"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.softCapBanner,
          {backgroundColor: tint.bg, borderColor: tint.border},
        ]}>
        <View style={styles.bannerHeader}>
          <AlertIcon width={14} height={14} stroke={tint.fg} />
          <Text
            style={[
              styles.bannerTitle,
              styles.bannerHeaderTitle,
              {color: tint.fg},
            ]}>
            {copy.warning.title}
          </Text>
          <Text
            style={[styles.bannerPercent, {color: tint.fg}]}
            testID="banner-percent">
            {`${percent}%`}
          </Text>
        </View>
        <Text style={styles.softCapBannerText}>{copy.warning.message}</Text>
        <Meter ratio={variant.ratio} tint={tint.meter} styles={styles} />
        <View style={styles.bannerActions}>
          {variant.nextTierTokens !== null ? (
            <PaperButton
              mode="text"
              compact
              disabled={isRunActive}
              onPress={onIncrease}>
              {copy.warning.increase}
            </PaperButton>
          ) : null}
          <PaperButton
            mode="text"
            compact
            onPress={() => onDismiss('context-warning')}>
            {copy.warning.dismiss}
          </PaperButton>
        </View>
      </View>
    );
  }

  if (variant.kind === 'context-full') {
    const tint = variantTints['context-full'];
    const titleCopy = variant.escalated
      ? copy.fullEscalated.title
      : variant.heavyTalent
        ? copy.fullHeavyTalent.title
        : copy.full.title;
    const friendlyTalent = variant.heavyTalent
      ? (copy.talentLabels?.[variant.heavyTalent.name] ??
        copy.talentLabels?.fallback ??
        variant.heavyTalent.name)
      : null;
    const messageCopy = variant.escalated
      ? copy.fullEscalated.message
      : friendlyTalent
        ? t(copy.fullHeavyTalent.message, {talentName: friendlyTalent})
        : copy.full.message;
    return (
      <View
        testID="context-full-banner"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.softCapBanner,
          {backgroundColor: tint.bg, borderColor: tint.border},
        ]}>
        <View style={styles.bannerHeader}>
          <AlertIcon width={14} height={14} stroke={tint.fg} />
          <Text style={[styles.bannerTitle, {color: tint.fg}]}>
            {titleCopy}
          </Text>
        </View>
        <Text style={styles.softCapBannerText}>{messageCopy}</Text>
        {variant.ratio > 0 ? (
          <Meter ratio={variant.ratio} tint={tint.meter} styles={styles} />
        ) : null}
        <View style={styles.bannerActions}>
          {variant.nextTierTokens !== null ? (
            <PaperButton
              mode="text"
              compact
              disabled={isRunActive}
              onPress={onIncrease}>
              {copy.full.increase}
            </PaperButton>
          ) : null}
          <PaperButton mode="text" compact onPress={onNewChat}>
            {copy.full.newChat}
          </PaperButton>
        </View>
      </View>
    );
  }

  // context-remote-hedged — quieter, no meter, no alert icon (weak signal).
  const tint = variantTints['context-remote-hedged'];
  return (
    <View
      testID="context-remote-hedged-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.softCapBanner,
        {backgroundColor: tint.bg, borderColor: tint.border},
      ]}>
      <Text style={[styles.bannerTitle, {color: tint.fg}]}>
        {copy.remoteHedged.title}
      </Text>
      <Text style={styles.softCapBannerText}>{copy.remoteHedged.message}</Text>
      <View style={styles.bannerActions}>
        <PaperButton
          mode="text"
          compact
          onPress={() => onDismiss('context-remote-hedged')}>
          {copy.remoteHedged.dismiss}
        </PaperButton>
      </View>
    </View>
  );
};
