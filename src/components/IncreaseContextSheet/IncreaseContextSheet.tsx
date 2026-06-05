import React, {useContext, useEffect, useMemo, useState} from 'react';
import {Pressable, View} from 'react-native';

import Slider from '@react-native-community/slider';
import DeviceInfo from 'react-native-device-info';
import {observer} from 'mobx-react';
import {Button, Text} from 'react-native-paper';

import {Sheet} from '..';
import {useTheme} from '../../hooks';
import {modelStore} from '../../store';
import {L10nContext, formatBytes} from '../../utils';
import {t} from '../../locales';
import {Model} from '../../utils/types';
import {getModelMemoryRequirement} from '../../utils/memoryEstimator';
import {CONTEXT_LADDER} from '../../utils/bannerVariantResolver';

import {makeFitStatusFor} from './fitStatus';
import {createStyles} from './styles';

interface IncreaseContextSheetProps {
  isVisible: boolean;
  model: Model;
  projectionModel?: Model;
  currentNCtx: number;
  onClose: () => void;
  onReloadStart: () => void;
  onReloadResult: (success: boolean, target: number) => void;
  // Start a fresh chat — used by the no-fit state where no larger context fits.
  onNewChat: () => void;
}

const kLabel = (tokens: number): string => {
  const k = tokens / 1024;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
};

// ≈0.75 words per token, rounded to nearest hundred for readability.
const approxWords = (tokens: number): number =>
  Math.round((tokens * 0.75) / 100) * 100;

/**
 * Sheet for the context-warning / context-full banner's increase-context CTA.
 * The user picks a larger context size on a slider over CONTEXT_LADDER (capped
 * at the model's trained context length); confirm reloads the model at the
 * chosen size. On failure the prior n_ctx is restored AND the model is
 * re-initialised so it ends up loaded, not just the setting restored. Chat
 * history is preserved (messages live in the store, not in the native context).
 * When no larger size fits the device, the sheet hides confirm and offers a
 * New-chat affordance instead of a dead-end disabled button.
 */
export const IncreaseContextSheet: React.FC<IncreaseContextSheetProps> =
  observer(
    ({
      isVisible,
      model,
      projectionModel,
      currentNCtx,
      onClose,
      onReloadStart,
      onReloadResult,
      onNewChat,
    }) => {
      const theme = useTheme();
      const l10n = useContext(L10nContext);
      const styles = createStyles(theme);
      const [isReloading, setIsReloading] = useState(false);

      const [totalMemory, setTotalMemory] = useState(0);
      useEffect(() => {
        if (!isVisible) {
          return;
        }
        let cancelled = false;
        DeviceInfo.getTotalMemory()
          .then(total => !cancelled && setTotalMemory(total))
          .catch(() => !cancelled && setTotalMemory(0));
        return () => {
          cancelled = true;
        };
      }, [isVisible]);

      // Cap the ladder at the model's trained context length (GGUF header),
      // falling back to the ladder top when the header is absent.
      const modelMaxCtx =
        model.ggufMetadata?.context_length ??
        CONTEXT_LADDER[CONTEXT_LADDER.length - 1];

      // Only stops strictly above the current value are offered — the sheet is
      // an upgrade affordance. The model max is appended as the rightmost stop.
      const ladder = useMemo<number[]>(() => {
        const filtered: number[] = CONTEXT_LADDER.filter(
          tier => tier > currentNCtx && tier <= modelMaxCtx,
        );
        if (modelMaxCtx > (filtered[filtered.length - 1] ?? 0)) {
          filtered.push(modelMaxCtx);
        }
        return filtered;
      }, [modelMaxCtx, currentNCtx]);

      const ceiling = Math.max(
        modelStore.largestSuccessfulLoad ?? 0,
        modelStore.availableMemoryCeiling ?? 0,
      );

      const memBytes = useMemo(
        () => (nCtx: number) =>
          getModelMemoryRequirement(model, projectionModel, {
            ...modelStore.contextInitParams,
            n_ctx: nCtx,
          }),
        [model, projectionModel],
      );

      const fitStatusFor = useMemo(
        () => makeFitStatusFor({memBytesFor: memBytes, ceiling, totalMemory}),
        [memBytes, ceiling, totalMemory],
      );

      // Default to the smallest fitting stop above current; fall back to the
      // smallest upgrade so the fit chip / status line guide toward a fit.
      const recommendedIdx = useMemo(() => {
        const fittingIdx = ladder.findIndex(v => fitStatusFor(v) === 'fits');
        return fittingIdx >= 0 ? fittingIdx : 0;
      }, [ladder, fitStatusFor]);

      const [pickIdx, setPickIdx] = useState(0);
      const [advancedOpen, setAdvancedOpen] = useState(false);
      useEffect(() => {
        if (isVisible) {
          setPickIdx(recommendedIdx);
          setAdvancedOpen(false);
        }
      }, [isVisible, recommendedIdx]);

      const chosen =
        ladder[Math.min(pickIdx, ladder.length - 1)] ?? currentNCtx;
      const chosenFit = fitStatusFor(chosen);
      const chosenMem = memBytes(chosen);

      // Furthest "fits" stop on the ladder — drives the device-limit status
      // copy and the no-fit / memory-constrained state.
      const deviceLimitIdx = useMemo(() => {
        let idx = -1;
        for (let i = 0; i < ladder.length; i++) {
          if (fitStatusFor(ladder[i]) === 'fits') {
            idx = i;
          }
        }
        return idx;
      }, [ladder, fitStatusFor]);
      const memConstrained =
        deviceLimitIdx >= 0 && deviceLimitIdx < ladder.length - 1;

      // No upgrade fits the device — the sheet must not be a dead-end.
      const anyFits = deviceLimitIdx >= 0;

      // Semantic fit-zone tints. Warm hues read as a memory warning; the brand
      // tokens skew neutral and don't carry that meaning.
      const fitsTint = '#5C8E73';
      const tightTint = '#E08A5F';
      const wontTint = theme.colors.error;
      const chipTint =
        chosenFit === 'fits'
          ? fitsTint
          : chosenFit === 'tight'
            ? tightTint
            : wontTint;
      const chipLabel =
        chosenFit === 'fits'
          ? l10n.chat.increaseContextFitsChip
          : chosenFit === 'tight'
            ? l10n.chat.increaseContextTightChip
            : l10n.chat.increaseContextWontFitChip;

      let statusText: string;
      if (chosenFit === 'tight' && deviceLimitIdx >= 0) {
        statusText = t(l10n.chat.increaseContextTightStatus, {
          tokens: kLabel(ladder[deviceLimitIdx]),
        });
      } else if (chosenFit === 'wont_fit') {
        statusText = t(l10n.chat.increaseContextWontFitStatus, {
          tokens: kLabel(chosen),
        });
      } else {
        statusText = memConstrained
          ? l10n.chat.increaseContextFitsStatus
          : l10n.chat.increaseContextFitsUnconstrainedStatus;
      }

      const confirmDisabled = chosenFit === 'wont_fit' || isReloading;
      const confirmLabel = isReloading
        ? l10n.chat.increaseContextReloadingShort
        : t(l10n.chat.increaseContextConfirmSize, {size: kLabel(chosen)});

      const handleConfirm = async () => {
        if (confirmDisabled) {
          return;
        }
        const previousNCtx = modelStore.contextInitParams.n_ctx;
        setIsReloading(true);
        onReloadStart();
        onClose();
        try {
          modelStore.setNContext(chosen);
          await modelStore.releaseContext();
          await modelStore.initContext(model);
          onReloadResult(true, chosen);
        } catch {
          // releaseContext already unloaded the model. Restore the prior n_ctx
          // and re-init so the model is actually loaded again, not just the
          // setting restored.
          modelStore.setNContext(previousNCtx);
          try {
            await modelStore.initContext(model);
          } catch {
            // Re-init also failed; the banner's New-chat CTA stays reachable.
          }
          onReloadResult(false, chosen);
        } finally {
          setIsReloading(false);
        }
      };

      const handleNewChat = () => {
        onNewChat();
        onClose();
      };

      return (
        <Sheet
          isVisible={isVisible}
          onClose={onClose}
          title={l10n.chat.increaseContextTitle}
          // Fixed tall snap-point — Sheet.ScrollView measures its own intrinsic
          // height as zero when nested, so without one the sheet collapses and
          // the bottom content (status line, advanced, actions) gets clipped.
          snapPoints={['85%']}>
          <Sheet.ScrollView contentContainerStyle={styles.container}>
            <Text variant="bodyMedium" style={styles.body}>
              {l10n.chat.increaseContextBody}
            </Text>

            {anyFits ? (
              <>
                <View style={styles.pickHead}>
                  <View>
                    <Text variant="displaySmall" style={styles.pickVal}>
                      {kLabel(chosen)}
                      <Text variant="bodyMedium" style={styles.pickUnit}>
                        {`  ${l10n.chat.increaseContextTokensUnit}`}
                      </Text>
                    </Text>
                    <Text variant="bodySmall" style={styles.pickSub}>
                      {t(l10n.chat.increaseContextWordsRam, {
                        words: approxWords(chosen).toLocaleString(),
                        ram: formatBytes(chosenMem, 1),
                      })}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.fitChip,
                      {backgroundColor: chipTint + '22'},
                    ]}>
                    <Text style={[styles.fitChipText, {color: chipTint}]}>
                      {chipLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.sliderWrap}>
                  <Slider
                    testID="increase-context-slider"
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={Math.max(0, ladder.length - 1)}
                    step={1}
                    value={pickIdx}
                    onValueChange={setPickIdx}
                    disabled={isReloading || ladder.length <= 1}
                    accessibilityLabel={
                      l10n.chat.increaseContextSliderA11yLabel
                    }
                    accessibilityValue={{
                      text: t(l10n.chat.increaseContextSliderA11yValue, {
                        tokens: kLabel(chosen),
                      }),
                    }}
                    minimumTrackTintColor={chipTint}
                    maximumTrackTintColor={theme.colors.surfaceDisabled}
                    thumbTintColor={theme.colors.primary}
                  />
                  <View style={styles.sliderEnds}>
                    <Text variant="labelSmall" style={styles.sliderEndsText}>
                      {kLabel(ladder[0])}
                    </Text>
                    <Text variant="labelSmall" style={styles.sliderEndsText}>
                      {t(l10n.chat.increaseContextModelMax, {
                        tokens: kLabel(modelMaxCtx),
                      })}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.statusLine,
                    chosenFit === 'tight' && {
                      backgroundColor: tightTint + '14',
                    },
                    chosenFit === 'wont_fit' && {
                      backgroundColor: wontTint + '14',
                    },
                  ]}>
                  <Text
                    variant="bodySmall"
                    style={styles.statusText}
                    testID="increase-context-status">
                    {statusText}
                  </Text>
                </View>

                <Text variant="bodySmall" style={styles.hedge}>
                  {l10n.chat.increaseContextHedge}
                </Text>

                <Pressable
                  onPress={() => setAdvancedOpen(o => !o)}
                  style={styles.advancedToggle}
                  testID="increase-context-advanced-toggle">
                  <Text variant="labelMedium" style={styles.advancedToggleText}>
                    {l10n.chat.increaseContextAdvanced}
                  </Text>
                </Pressable>
                {advancedOpen ? (
                  <Text variant="bodySmall" style={styles.advancedBody}>
                    {t(l10n.chat.increaseContextAdvancedBody, {
                      from: currentNCtx.toLocaleString(),
                      to: chosen.toLocaleString(),
                      max: modelMaxCtx.toLocaleString(),
                    })}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text
                variant="bodyMedium"
                style={styles.noFitBody}
                testID="increase-context-no-fit">
                {l10n.chat.increaseContextNoFitBody}
              </Text>
            )}
          </Sheet.ScrollView>

          <Sheet.Actions>
            <View style={styles.actions}>
              <Button
                mode="outlined"
                onPress={onClose}
                disabled={isReloading}
                style={styles.button}
                testID="increase-context-cancel">
                {l10n.chat.increaseContextCancel}
              </Button>
              {anyFits ? (
                <Button
                  mode="contained"
                  onPress={handleConfirm}
                  disabled={confirmDisabled}
                  loading={isReloading}
                  style={styles.button}
                  testID="increase-context-confirm">
                  {confirmLabel}
                </Button>
              ) : (
                <Button
                  mode="contained"
                  onPress={handleNewChat}
                  style={styles.button}
                  testID="increase-context-new-chat">
                  {l10n.chat.contextNewChat}
                </Button>
              )}
            </View>
          </Sheet.Actions>
        </Sheet>
      );
    },
  );
