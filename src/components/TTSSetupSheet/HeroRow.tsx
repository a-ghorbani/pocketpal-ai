import React, {useContext} from 'react';
import {View} from 'react-native';
import {IconButton, SegmentedButtons, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {TTS_PREVIEW_SAMPLE, getEngine} from '../../services/tts';
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

const STEPS_OPTIONS: {value: string; label: string}[] = [
  {value: '1', label: '1'},
  {value: '2', label: '2'},
  {value: '3', label: '3'},
  {value: '5', label: '5'},
  {value: '10', label: '10'},
];

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
    getEngine(current.engine)
      .play(TTS_PREVIEW_SAMPLE, current)
      .catch(err => {
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
            value={String(ttsStore.supertonicSteps)}
            onValueChange={value => {
              const parsed = Number(value) as SupertonicSteps;
              ttsStore.setSupertonicSteps(parsed);
            }}
            buttons={STEPS_OPTIONS}
          />
        </View>
      ) : null}
    </View>
  );
});
