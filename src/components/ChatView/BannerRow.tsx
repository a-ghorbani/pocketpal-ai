import * as React from 'react';
import {Text, View} from 'react-native';
import {Button as PaperButton} from 'react-native-paper';

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

/**
 * Inline banner row that renders one of the four visible variants
 * resolved by `resolveBannerVariant`. The shell (chrome, padding,
 * background) is shared via `softCapBanner` styles; only the inner
 * content changes per variant.
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

  if (variant.kind === 'html-soft-cap') {
    return (
      <View testID="soft-cap-warning" style={styles.softCapBanner}>
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
    return (
      <View testID="context-warning-banner" style={styles.softCapBanner}>
        <Text style={styles.bannerTitle}>{copy.warning.title}</Text>
        <Text style={styles.softCapBannerText}>{copy.warning.message}</Text>
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
      <View testID="context-full-banner" style={styles.softCapBanner}>
        <Text style={styles.bannerTitle}>{titleCopy}</Text>
        <Text style={styles.softCapBannerText}>{messageCopy}</Text>
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

  // context-remote-hedged
  return (
    <View testID="context-remote-hedged-banner" style={styles.softCapBanner}>
      <Text style={styles.bannerTitle}>{copy.remoteHedged.title}</Text>
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
