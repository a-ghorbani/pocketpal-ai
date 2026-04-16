import React, {useContext} from 'react';
import {View} from 'react-native';
import {IconButton, SegmentedButtons, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import type {EngineId, SupertonicSteps} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';
import {VoiceAvatar, getEngineAccent, getEngineTint} from './VoiceAvatar';

const engineChipKey = {
  kitten: 'engineChipKitten',
  kokoro: 'engineChipKokoro',
  supertonic: 'engineChipSupertonic',
  system: 'engineChipSystem',
} as const satisfies Record<EngineId, string>;

// `showSelectedCheck=false` + per-button `minWidth:0` lets the row shrink
// to fit small screens. Without these RNP forces ~60pt per button, which
// overflows on iPhone SE width with 6 cells.
const STEPS_BUTTONS = [1, 2, 3, 5, 10, 20].map(v => ({
  value: String(v),
  label: String(v),
  style: {minWidth: 0},
  labelStyle: {marginHorizontal: 0, marginVertical: 4},
}));

/**
 * Compact "current voice" strip used as the header of the unified Voices
 * sheet. Renders nothing when no voice is set — the voices list itself is
 * the answer in that state. When the current voice is Supertonic, the
 * strip embeds an inline quality (steps) selector since quality is a
 * property of that voice.
 */
export const HeroRow: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const current = ttsStore.currentVoice;
  if (!current) {
    return null;
  }

  const accent = getEngineAccent(current.engine);
  const tint = getEngineTint(current.engine, 0.1);
  const border = getEngineTint(current.engine, 0.18);

  const handlePreview = () => {
    ttsStore.preview(current).catch(err => {
      console.warn('[HeroRow] preview failed:', err);
    });
  };

  const showSupertonicQuality =
    current.engine === 'supertonic' &&
    ttsStore.supertonicDownloadState === 'ready';

  const subtitleParts = [
    l10n.voiceAndSpeech[engineChipKey[current.engine]],
    showSupertonicQuality ? `${ttsStore.supertonicSteps} steps` : null,
  ].filter(Boolean);

  return (
    <View
      style={[
        styles.heroRow,
        {backgroundColor: tint, borderColor: border, borderWidth: 1},
      ]}
      testID="tts-hero-row">
      <View style={styles.heroRowBody}>
        <View style={styles.heroAvatarWrap}>
          <VoiceAvatar voice={current} size={48} />
        </View>
        <View style={styles.heroRowMain}>
          <Text style={styles.heroRowName} testID="tts-hero-voice-name">
            {current.name}
          </Text>
          <Text style={styles.heroSubtitle}>{subtitleParts.join('  ·  ')}</Text>
        </View>
        <IconButton
          icon="play"
          size={20}
          iconColor={accent}
          containerColor={theme.colors.surface}
          onPress={handlePreview}
          accessibilityLabel={l10n.voiceAndSpeech.previewButton}
          testID="tts-hero-preview-button"
          style={styles.heroPreviewButton}
        />
      </View>
      {showSupertonicQuality ? (
        <View style={styles.heroQualityBlock}>
          <Text style={styles.heroQualityLabel}>
            {l10n.voiceAndSpeech.supertonicStepsLabel}
          </Text>
          <SegmentedButtons
            density="high"
            value={String(ttsStore.supertonicSteps)}
            onValueChange={value =>
              ttsStore.setSupertonicSteps(Number(value) as SupertonicSteps)
            }
            // Tint the selected pill with the engine accent so the control
            // matches the Supertonic brand instead of RNP's default
            // secondaryContainer color.
            theme={{
              colors: {
                secondaryContainer: accent,
                onSecondaryContainer: '#FFFFFF',
              },
            }}
            buttons={STEPS_BUTTONS.map(b => ({
              ...b,
              showSelectedCheck: false,
            }))}
          />
        </View>
      ) : null}
    </View>
  );
});
