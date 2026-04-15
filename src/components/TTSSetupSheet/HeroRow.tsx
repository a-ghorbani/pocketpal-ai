import React, {useContext} from 'react';
import {View} from 'react-native';
import {IconButton, Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {
  KITTEN_VOICES,
  KOKORO_VOICES,
  SUPERTONIC_VOICES,
  TTS_PREVIEW_SAMPLE,
  getEngine,
} from '../../services/tts';
import type {EngineId, Voice} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

const engineChipKey = {
  kitten: 'engineChipKitten',
  kokoro: 'engineChipKokoro',
  supertonic: 'engineChipSupertonic',
  system: 'engineChipSystem',
} as const satisfies Record<EngineId, string>;

const characterL10nKey = {
  warm: 'characterWarm',
  clear: 'characterClear',
  deep: 'characterDeep',
  bright: 'characterBright',
} as const;

const lookupCatalogVoice = (voice: Voice): Voice | undefined => {
  switch (voice.engine) {
    case 'kitten':
      return KITTEN_VOICES.find(v => v.id === voice.id);
    case 'kokoro':
      return KOKORO_VOICES.find(v => v.id === voice.id);
    case 'supertonic':
      return SUPERTONIC_VOICES.find(v => v.id === voice.id);
    default:
      return undefined;
  }
};

interface HeroRowProps {
  onOpenBrowse: () => void;
}

/**
 * Primary-view hero row: big current-voice label, engine chip, character
 * chip, and an inline preview button. Tapping the body opens Browse.
 */
export const HeroRow: React.FC<HeroRowProps> = observer(({onOpenBrowse}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const current = ttsStore.currentVoice;
  const catalogVoice = current ? lookupCatalogVoice(current) : undefined;
  const character = catalogVoice?.character ?? current?.character;

  const handlePreview = () => {
    if (!current) {
      return;
    }
    getEngine(current.engine)
      .play(TTS_PREVIEW_SAMPLE, current)
      .catch(err => {
        console.warn('[HeroRow] preview failed:', err);
      });
  };

  return (
    <TouchableRipple
      style={styles.heroRow}
      onPress={onOpenBrowse}
      testID="tts-hero-row">
      <View style={styles.heroRowBody}>
        <View style={styles.heroRowMain}>
          {current ? (
            <Text style={styles.heroRowName} testID="tts-hero-voice-name">
              {current.name}
            </Text>
          ) : (
            <Text
              style={styles.heroRowNameMuted}
              testID="tts-hero-voice-not-set">
              {l10n.voiceAndSpeech.notSet}
            </Text>
          )}
          {current ? (
            <View style={styles.heroChipsRow}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {l10n.voiceAndSpeech[engineChipKey[current.engine]]}
                </Text>
              </View>
              {character ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    {l10n.voiceAndSpeech[characterL10nKey[character]]}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {current ? (
          <IconButton
            icon="play"
            size={22}
            onPress={handlePreview}
            accessibilityLabel={l10n.voiceAndSpeech.previewButton}
            testID="tts-hero-preview-button"
          />
        ) : null}
      </View>
    </TouchableRipple>
  );
});
