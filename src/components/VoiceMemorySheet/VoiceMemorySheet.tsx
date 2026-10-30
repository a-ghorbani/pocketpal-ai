import React, {useContext} from 'react';
import {StyleSheet, View} from 'react-native';

import {Button, Text} from 'react-native-paper';

import {Sheet} from '../Sheet';
import {useTheme} from '../../hooks';
import {L10nContext, formatBytes} from '../../utils';
import {asrTierLabel} from '../../utils/asrTierLabel';
import {t} from '../../locales';
import type {VoiceMemoryFit} from '../../services/voice';

interface VoiceMemorySheetProps {
  fit: VoiceMemoryFit | null;
  chatModelName: string;
  voiceName: string;
  onClose: () => void;
  onContinue: () => void;
  onChooseSmallerModel: () => void;
}

/**
 * Shown before entering voice mode when the chat model, whisper and the
 * voice don't comfortably fit together. Continuing is offered only when
 * whisper itself fits.
 */
export const VoiceMemorySheet: React.FC<VoiceMemorySheetProps> = ({
  fit,
  chatModelName,
  voiceName,
  onClose,
  onContinue,
  onChooseSmallerModel,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const strings = l10n.voiceMode;
  const wontFit = fit?.status === 'wont_fit';
  const breakdown = fit?.breakdown;
  const total = Math.max(
    breakdown?.availableBytes ?? 0,
    breakdown?.neededBytes ?? 0,
    1,
  );

  const rowStyle = {
    chat: {
      label: t(strings.memoryChatRow, {name: chatModelName}),
      color: theme.colors.primary,
    },
    stt: {
      label: fit
        ? t(strings.memorySttRowModel, {tier: asrTierLabel(fit.sttTier, l10n)})
        : '',
      color: theme.colors.tertiary,
    },
    tts: {
      label: t(strings.memoryVoiceRow, {name: voiceName}),
      color: theme.colors.iconModelTypeAudio,
    },
  };
  const rows = (breakdown?.rows ?? []).map(row => ({
    key: row.kind,
    bytes: row.bytes,
    ...rowStyle[row.kind],
  }));

  return (
    <Sheet
      isVisible={fit != null}
      onClose={onClose}
      title={wontFit ? strings.memoryWontFitTitle : strings.memoryTightTitle}
      snapPoints={['60%']}>
      <Sheet.ScrollView
        contentContainerStyle={styles.content}
        testID="voice-memory-sheet">
        <Text
          variant="bodyMedium"
          style={{color: theme.colors.onSurfaceVariant}}>
          {wontFit ? strings.memoryWontFitBody : strings.memoryTightBody}
        </Text>

        <View
          style={[styles.bar, {backgroundColor: theme.colors.surfaceVariant}]}>
          {rows.map(row => (
            <View
              key={row.key}
              style={{
                width: `${(row.bytes / total) * 100}%`,
                backgroundColor: row.color,
              }}
            />
          ))}
        </View>

        <View style={styles.rows}>
          {rows.map(row => (
            <View
              key={row.key}
              style={styles.row}
              testID={`voice-memory-${row.key}`}>
              <View style={styles.label}>
                <View style={[styles.swatch, {backgroundColor: row.color}]} />
                <Text variant="bodyMedium">{row.label}</Text>
              </View>
              <Text variant="bodyMedium">{formatBytes(row.bytes, 1)}</Text>
            </View>
          ))}
          {breakdown && (
            <View
              style={[
                styles.row,
                styles.total,
                {borderColor: theme.colors.border},
              ]}
              testID="voice-memory-needed">
              <Text variant="titleSmall">{strings.memoryNeeded}</Text>
              <Text variant="titleSmall">
                {t(strings.memoryNeededValue, {
                  needed: formatBytes(breakdown.neededBytes, 1),
                  available: formatBytes(breakdown.availableBytes, 1),
                })}
              </Text>
            </View>
          )}
        </View>

        {!wontFit && (
          <Button
            mode="contained"
            testID="voice-memory-continue"
            onPress={onContinue}>
            {strings.continueAnywayCta}
          </Button>
        )}
        <Button
          mode={wontFit ? 'contained' : 'text'}
          testID="voice-memory-smaller-model"
          onPress={onChooseSmallerModel}>
          {strings.chooseSmallerModelCta}
        </Button>
      </Sheet.ScrollView>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 16,
  },
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  rows: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  total: {
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
