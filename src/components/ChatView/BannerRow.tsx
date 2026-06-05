import React, {useContext} from 'react';
import {View} from 'react-native';

import {observer} from 'mobx-react';
import {Button, Text} from 'react-native-paper';

import {createStyles} from './styles';

import {useTheme} from '../../hooks';
import {chatSessionStore, modelStore} from '../../store';
import {L10nContext} from '../../utils';
import {MessageType, ModelOrigin} from '../../utils/types';
import {resolveBannerVariant} from '../../utils/bannerVariantResolver';
import {getModelMemoryRequirement} from '../../utils/memoryEstimator';
import {talentRegistry} from '../../services/talents';
import {t} from '../../locales';

interface BannerRowProps {
  messages: MessageType.Any[];
  htmlPreviewCount: number;
  onIncreaseContext: (target: number) => void;
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

/**
 * The single chat-input banner slot. Renders the one variant resolved from the
 * completion snapshot and current model state, or the existing HTML soft-cap
 * sub-case. Dismiss writes back to the store; recovery CTAs are handled by the
 * host.
 */
export const BannerRow: React.FC<BannerRowProps> = observer(
  ({messages, htmlPreviewCount, onIncreaseContext, onNewChat}) => {
    const theme = useTheme();
    const styles = createStyles({theme});
    const l10n = useContext(L10nContext);

    const activeModel = modelStore.activeModel;
    const projectionModel = modelStore.models.find(
      m => m.id === modelStore.activeProjectionModelId,
    );
    const ceiling = modelStore.availableMemoryCeiling;

    const canFitNCtx =
      activeModel && ceiling !== undefined
        ? (candidate: number) => {
            try {
              const required = getModelMemoryRequirement(
                activeModel,
                projectionModel,
                {...modelStore.contextInitParams, n_ctx: candidate},
              );
              return required <= ceiling;
            } catch {
              return false;
            }
          }
        : undefined;

    const {variant, nextNCtx, heavyTalentName} = resolveBannerVariant(
      chatSessionStore.lastCompletionResult,
      {
        effectiveNCtx: modelStore.activeContextSettings?.n_ctx,
        isRemote: activeModel?.origin === ModelOrigin.REMOTE,
        htmlPreviewCount,
        activeModelId: modelStore.activeModelId,
        dismissed: chatSessionStore.dismissedBannerVariants,
        heavyTalentName: deriveHeavyTalentName(messages),
        canFitNCtx,
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
      return (
        <View testID="context-warning-banner" style={styles.contextBanner}>
          <Text style={styles.contextBannerText}>
            {l10n.chat.contextWarning}
          </Text>
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
        <Text style={styles.contextFullBannerText}>{fullText}</Text>
        <View style={styles.contextBannerActions}>
          <Button
            compact
            mode="contained-tonal"
            testID="context-full-new-chat"
            onPress={onNewChat}>
            {l10n.chat.contextNewChat}
          </Button>
          {nextNCtx !== undefined ? (
            <Button
              compact
              mode="contained-tonal"
              testID="context-full-increase"
              onPress={() => onIncreaseContext(nextNCtx)}>
              {l10n.chat.contextIncrease}
            </Button>
          ) : null}
        </View>
      </View>
    );
  },
);
