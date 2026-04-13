import React, {useContext} from 'react';
import {View} from 'react-native';
import {Button, Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {SUPERTONIC_VOICES} from '../../services/tts';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

/**
 * v1.1 placeholder: Supertonic voices are listed but every row is
 * visually disabled — the engine is stubbed. v1.2 will enable the
 * install flow and wire playback.
 */
export const SupertonicSection: React.FC = () => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  return (
    <View style={styles.section} testID="tts-supertonic-section">
      <Text variant="titleMedium" style={styles.sectionHeader}>
        {l10n.voiceAndSpeech.supertonicSectionTitle}
      </Text>
      <Text variant="bodyMedium" style={styles.sectionDescription}>
        {l10n.voiceAndSpeech.supertonicSectionDescription}
      </Text>
      <View
        style={styles.installPlaceholder}
        testID="tts-supertonic-install-cta">
        <Text style={styles.installPlaceholderText}>
          {l10n.voiceAndSpeech.supertonicInstallCta}
        </Text>
      </View>
      {SUPERTONIC_VOICES.map(voice => (
        <View
          key={voice.id}
          style={[styles.row, styles.rowDisabled]}
          testID={`tts-supertonic-voice-${voice.id}`}
          accessibilityState={{disabled: true}}>
          <Text style={styles.rowVoiceName}>{voice.name}</Text>
          <Button
            mode="text"
            compact
            disabled
            style={styles.previewButton}
            testID={`tts-supertonic-preview-${voice.id}`}
            onPress={() => {
              /* non-functional in v1.1 — wired in v1.2 */
            }}>
            {l10n.voiceAndSpeech.previewButton}
          </Button>
        </View>
      ))}
    </View>
  );
};
