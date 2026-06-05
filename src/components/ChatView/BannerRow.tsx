import React, {useContext} from 'react';
import {View} from 'react-native';

import {observer} from 'mobx-react';
import {Button, Text} from 'react-native-paper';

import {createStyles} from './styles';

import {AlertIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {chatSessionStore, modelStore} from '../../store';
import {L10nContext} from '../../utils';
import {MessageType, ModelOrigin} from '../../utils/types';
import {resolveBannerVariant} from '../../utils/bannerVariantResolver';
import {talentRegistry} from '../../services/talents';
import {t} from '../../locales';

interface BannerRowProps {
  messages: MessageType.Any[];
  htmlPreviewCount: number;
  // True when at least one larger context tier fits the device. Gates the
  // increase CTA's visibility (the sheet owns the actual target).
  canIncrease: boolean;
  onIncreaseContext: () => void;
  onNewChat: () => void;
}

// Heavy-talent name for the full-banner sub-copy: the newest assistant turn's
// first tool call whose engine declares a recommended context. Declarative
// only — never moves the banner trigger.
function deriveHeavyTalentName(
  messages: MessageType.Any[],
): string | undefined {
  const latestTurn = messages.find(m => m.type === 'assistant_turn') as
    | MessageType.AssistantTurn
    | undefined;
  for (const step of latestTurn?.steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      const name = call.function?.name;
      if (name && talentRegistry.get(name)?.recommendedContextTokens != null) {
        return name;
      }
    }
  }
  return undefined;
}

const Meter: React.FC<{
  ratio: number;
  tint: string;
  styles: ReturnType<typeof createStyles>;
}> = ({ratio, tint, styles}) => (
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
 * The single chat-input banner slot. Renders the one variant resolved from the
 * completion snapshot and current model state, or the existing HTML soft-cap
 * sub-case. Dismiss writes back to the store; recovery CTAs are handled by the
 * host.
 */
export const BannerRow: React.FC<BannerRowProps> = observer(
  ({messages, htmlPreviewCount, canIncrease, onIncreaseContext, onNewChat}) => {
    const theme = useTheme();
    const styles = createStyles({theme});
    const l10n = useContext(L10nContext);

    const activeModel = modelStore.activeModel;

    const {variant, heavyTalentName, ratio} = resolveBannerVariant(
      chatSessionStore.lastCompletionResult,
      {
        effectiveNCtx: modelStore.activeContextSettings?.n_ctx,
        isRemote: activeModel?.origin === ModelOrigin.REMOTE,
        htmlPreviewCount,
        activeModelId: modelStore.activeModelId,
        dismissed: chatSessionStore.dismissedBannerVariants,
        heavyTalentName: deriveHeavyTalentName(messages),
      },
    );

    if (variant === 'none') {
      return null;
    }

    if (variant === 'html-soft-cap') {
      return (
        <View testID="soft-cap-warning" style={styles.softCapBanner}>
          <Text style={styles.softCapBannerText}>
            {l10n.chat.softCapWarning}
          </Text>
        </View>
      );
    }

    if (variant === 'context-warning') {
      const percent = Math.round((ratio ?? 0) * 100);
      return (
        <View
          testID="context-warning-banner"
          style={styles.contextWarningBanner}>
          <View style={styles.bannerHeader}>
            <AlertIcon width={14} height={14} stroke={theme.colors.error} />
            <Text style={[styles.contextBannerText, styles.bannerHeaderText]}>
              {l10n.chat.contextWarning}
            </Text>
            <Text
              style={[styles.bannerPercent, {color: theme.colors.error}]}
              testID="banner-percent">
              {`${percent}%`}
            </Text>
          </View>
          {ratio != null ? (
            <Meter ratio={ratio} tint={theme.colors.error} styles={styles} />
          ) : null}
          <View style={styles.contextBannerActions}>
            {canIncrease ? (
              <Button
                compact
                mode="contained-tonal"
                testID="context-warning-increase"
                onPress={onIncreaseContext}>
                {l10n.chat.contextMoreRoom}
              </Button>
            ) : null}
            <Button
              compact
              mode="text"
              testID="context-banner-dismiss"
              onPress={() =>
                chatSessionStore.setBannerDismissed('context-warning')
              }>
              {l10n.chat.contextBannerDismiss}
            </Button>
          </View>
        </View>
      );
    }

    if (variant === 'context-remote-hedged') {
      return (
        <View
          testID="context-remote-hedged-banner"
          style={styles.contextBanner}>
          <Text style={styles.contextBannerText}>
            {l10n.chat.contextRemoteHedged}
          </Text>
          <Button
            compact
            mode="text"
            testID="context-banner-dismiss"
            onPress={() =>
              chatSessionStore.setBannerDismissed('context-remote-hedged')
            }>
            {l10n.chat.contextBannerDismiss}
          </Button>
        </View>
      );
    }

    // context-full (sticky; no dismiss).
    const talentNames = l10n.components.palSheet.talentNames;
    const heavyTalentLabel = heavyTalentName
      ? (talentNames[heavyTalentName as keyof typeof talentNames] ??
        heavyTalentName)
      : undefined;
    const fullText = heavyTalentLabel
      ? t(l10n.chat.contextFullHeavyTalent, {talent: heavyTalentLabel})
      : chatSessionStore.consecutiveFullFailures >= 2
        ? l10n.chat.contextFullEscalated
        : l10n.chat.contextFull;

    return (
      <View testID="context-full-banner" style={styles.contextFullBanner}>
        <View style={styles.bannerHeader}>
          <AlertIcon width={14} height={14} stroke={theme.colors.error} />
          <Text style={[styles.contextFullBannerText, styles.bannerHeaderText]}>
            {fullText}
          </Text>
        </View>
        {ratio != null ? (
          <Meter ratio={ratio} tint={theme.colors.error} styles={styles} />
        ) : null}
        <View style={styles.contextBannerActions}>
          {canIncrease ? (
            <>
              <Button
                compact
                mode="contained-tonal"
                testID="context-full-increase"
                onPress={onIncreaseContext}>
                {l10n.chat.contextMoreRoom}
              </Button>
              <Text style={styles.bannerOr}>{l10n.chat.contextOr}</Text>
            </>
          ) : null}
          <Button
            compact
            mode="contained-tonal"
            testID="context-full-new-chat"
            onPress={onNewChat}>
            {l10n.chat.contextNewChat}
          </Button>
        </View>
      </View>
    );
  },
);
