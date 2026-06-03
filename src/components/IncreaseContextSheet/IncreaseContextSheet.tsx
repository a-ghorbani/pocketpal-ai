import React, {useContext, useEffect, useMemo, useState} from 'react';
import {Pressable, View} from 'react-native';

import Slider from '@react-native-community/slider';
import DeviceInfo from 'react-native-device-info';
import {Button, Text} from 'react-native-paper';

import {Sheet} from '../Sheet/Sheet';
import {useTheme} from '../../hooks';
import {L10nContext, formatBytes} from '../../utils';
import {t} from '../../locales';
import {Model} from '../../utils/types';
import {modelStore} from '../../store';
import {getModelMemoryRequirement} from '../../utils/memoryEstimator';
import {CONTEXT_LADDER} from '../../utils/bannerVariantResolver';
import {createStyles} from './styles';

type FitStatus = 'fits' | 'tight' | 'wont_fit';

interface IncreaseContextSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onConfirm: (chosenNCtx: number) => void;
  currentNCtx: number;
  model: Model;
  projectionModel?: Model;
  isReloading?: boolean;
}

const kLabel = (tokens: number): string => {
  const k = tokens / 1024;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
};

// ≈0.75 words per token, rounded to nearest hundred for readability.
const approxWords = (tokens: number): number =>
  Math.round((tokens * 0.75) / 100) * 100;

export const IncreaseContextSheet: React.FC<IncreaseContextSheetProps> = ({
  isVisible,
  onClose,
  onConfirm,
  currentNCtx,
  model,
  projectionModel,
  isReloading,
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const copy = l10n.chat.contextWarning.sheet;

  const [totalMemory, setTotalMemory] = useState<number | null>(null);
  useEffect(() => {
    if (!isVisible) {
      return;
    }
    let cancelled = false;
    DeviceInfo.getTotalMemory()
      .then(total => {
        if (!cancelled) {
          setTotalMemory(total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTotalMemory(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isVisible]);

  // Cap the ladder at the model's trained context length (GGUF header).
  const modelMaxCtx =
    model.ggufMetadata?.context_length ??
    CONTEXT_LADDER[CONTEXT_LADDER.length - 1];
  const ladder = useMemo(
    () => CONTEXT_LADDER.filter(t => t <= modelMaxCtx),
    [modelMaxCtx],
  );

  // Available ceiling (calibrated) and total RAM define the fits/tight
  // boundary, same semantics as useMemoryCheck.ts.
  const ceiling = Math.max(
    modelStore.largestSuccessfulLoad ?? 0,
    modelStore.availableMemoryCeiling ?? 0,
  );

  const memBytes = (nCtx: number): number =>
    getModelMemoryRequirement(model, projectionModel, {
      ...modelStore.contextInitParams,
      n_ctx: nCtx,
    });

  const fitStatusFor = (nCtx: number): FitStatus => {
    const req = memBytes(nCtx);
    if (req <= ceiling) {
      return 'fits';
    }
    if (totalMemory !== null && totalMemory > 0 && req <= totalMemory) {
      return 'tight';
    }
    return 'wont_fit';
  };

  // Default: largest "fits" stop above current, falling back to the next
  // ladder index when no stop fits cleanly.
  const recommendedIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < ladder.length; i++) {
      if (ladder[i] > currentNCtx && fitStatusFor(ladder[i]) === 'fits') {
        idx = i;
      }
    }
    if (idx < 0) {
      // No fitting stop above current — point to the next ladder step so the
      // user lands somewhere intentional.
      const nextAbove = ladder.findIndex(v => v > currentNCtx);
      idx = nextAbove >= 0 ? nextAbove : ladder.length - 1;
    }
    return Math.max(idx, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladder, currentNCtx, ceiling, totalMemory, projectionModel]);

  const [pickIdx, setPickIdx] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => {
    if (isVisible) {
      setPickIdx(recommendedIdx);
      setAdvancedOpen(false);
    }
  }, [isVisible, recommendedIdx]);

  const chosen = ladder[Math.min(pickIdx, ladder.length - 1)] ?? currentNCtx;
  const chosenFit = fitStatusFor(chosen);
  const chosenMem = memBytes(chosen);

  // Furthest "fits" stop on the ladder — used to draw the device-limit tick.
  const deviceLimitIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < ladder.length; i++) {
      if (fitStatusFor(ladder[i]) === 'fits') {
        idx = i;
      }
    }
    return idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladder, ceiling, totalMemory]);
  const memConstrained =
    deviceLimitIdx >= 0 && deviceLimitIdx < ladder.length - 1;

  // Theme tints
  const fitsTint = (theme.colors as any).primary ?? theme.colors.onSurface;
  const tightTint = (theme.colors as any).tertiary ?? theme.colors.onSurface;
  const wontTint = theme.colors.error;
  const chipTint =
    chosenFit === 'fits'
      ? fitsTint
      : chosenFit === 'tight'
        ? tightTint
        : wontTint;
  const chipLabel =
    chosenFit === 'fits'
      ? copy.fitsChip
      : chosenFit === 'tight'
        ? copy.tightChip
        : copy.wontFitChip;

  // Adaptive status line
  let statusText = '';
  if (chosenFit === 'tight' && deviceLimitIdx >= 0) {
    statusText = t(copy.tightStatus, {
      tokens: kLabel(ladder[deviceLimitIdx]),
    });
  } else if (chosenFit === 'wont_fit') {
    statusText = t(copy.wontFitStatus, {tokens: kLabel(chosen)});
  } else {
    statusText = memConstrained
      ? copy.fitsStatus
      : copy.fitsUnconstrainedStatus;
  }

  const confirmDisabled = chosenFit === 'wont_fit' || isReloading;
  const confirmLabel = isReloading
    ? copy.confirmGeneric
    : t(copy.confirm, {size: kLabel(chosen)});

  const handleConfirm = () => {
    if (confirmDisabled) {
      return;
    }
    onConfirm(chosen);
  };

  // Reset the slider on close so re-opening starts fresh.
  const handleClose = () => {
    onClose();
  };

  return (
    <Sheet
      title={copy.title}
      isVisible={isVisible}
      onClose={handleClose}
      displayFullHeight={false}>
      <Sheet.ScrollView contentContainerStyle={styles.container}>
        <Text variant="bodyMedium" style={styles.body}>
          {copy.body}
        </Text>

        <View style={styles.pickHead}>
          <View>
            <Text variant="displaySmall" style={styles.pickVal}>
              {kLabel(chosen)}
              <Text variant="bodyMedium" style={styles.pickUnit}>
                {'  tokens'}
              </Text>
            </Text>
            <Text variant="bodySmall" style={styles.pickSub}>
              {t(copy.wordsRamReadout, {
                words: approxWords(chosen).toLocaleString(),
                ram: formatBytes(chosenMem, 1),
              })}
            </Text>
          </View>
          <View style={[styles.fitChip, {backgroundColor: chipTint + '22'}]}>
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
            minimumTrackTintColor={chipTint}
            maximumTrackTintColor={theme.colors.surfaceDisabled}
            thumbTintColor={theme.colors.primary}
          />
          <View style={styles.sliderEnds}>
            <Text variant="labelSmall" style={styles.sliderEndsText}>
              {kLabel(ladder[0])}
            </Text>
            <Text variant="labelSmall" style={styles.sliderEndsText}>
              {t(copy.modelMaxLabel, {tokens: kLabel(modelMaxCtx)})}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statusLine,
            chosenFit === 'tight' && {backgroundColor: tightTint + '14'},
            chosenFit === 'wont_fit' && {backgroundColor: wontTint + '14'},
          ]}>
          <Text variant="bodySmall" style={styles.statusText}>
            {statusText}
          </Text>
        </View>

        <Text variant="bodySmall" style={styles.hedge}>
          {copy.hedge}
        </Text>

        <Pressable
          onPress={() => setAdvancedOpen(o => !o)}
          style={styles.advancedToggle}
          testID="increase-context-advanced-toggle">
          <Text variant="labelMedium" style={styles.advancedToggleText}>
            {copy.advanced}
          </Text>
        </Pressable>
        {advancedOpen ? (
          <Text variant="bodySmall" style={styles.advancedBody}>
            {t(copy.advancedBody, {
              from: currentNCtx.toLocaleString(),
              to: chosen.toLocaleString(),
              max: modelMaxCtx.toLocaleString(),
            })}
          </Text>
        ) : null}
      </Sheet.ScrollView>

      <Sheet.Actions>
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={handleClose}
            disabled={isReloading}
            style={styles.button}
            testID="increase-context-cancel">
            {copy.cancel}
          </Button>
          <Button
            mode="contained"
            onPress={handleConfirm}
            disabled={confirmDisabled}
            loading={isReloading}
            style={styles.button}
            testID="increase-context-confirm">
            {confirmLabel}
          </Button>
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
