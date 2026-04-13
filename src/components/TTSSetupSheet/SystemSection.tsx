import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';
import {Button, Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {SystemEngine, TTS_PREVIEW_SAMPLE, getEngine} from '../../services/tts';
import type {Voice} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

/**
 * Lists voices from the OS native TTS engine. Tapping a row selects the
 * voice and closes the sheet. The Preview button on each row speaks the
 * sample text with that voice without affecting `currentVoice`.
 */
export const SystemSection: React.FC<{visible: boolean}> = observer(
  ({visible}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const [voices, setVoices] = useState<Voice[]>([]);

    useEffect(() => {
      if (!visible) {
        return;
      }
      let cancelled = false;
      const engine = new SystemEngine();
      engine
        .getVoices()
        .then(v => {
          if (!cancelled) {
            setVoices(v);
          }
        })
        .catch(err => {
          console.warn('[TTSSetupSheet] system getVoices failed:', err);
        });
      return () => {
        cancelled = true;
      };
    }, [visible]);

    const selectedId =
      ttsStore.currentVoice?.engine === 'system'
        ? ttsStore.currentVoice.id
        : null;

    const handleSelect = (voice: Voice) => {
      ttsStore.setCurrentVoice({
        id: voice.id,
        name: voice.name,
        engine: 'system',
        language: voice.language,
      });
      ttsStore.closeSetupSheet();
    };

    const handlePreview = (voice: Voice) => {
      getEngine('system')
        .play(TTS_PREVIEW_SAMPLE, voice)
        .catch(err => {
          console.warn('[TTSSetupSheet] preview failed:', err);
        });
    };

    return (
      <View style={styles.section} testID="tts-system-section">
        <Text variant="titleMedium" style={styles.sectionHeader}>
          {l10n.voiceAndSpeech.systemSectionTitle}
        </Text>
        {voices.length === 0 ? (
          <Text style={styles.emptyText}>—</Text>
        ) : (
          voices.map(voice => {
            const isSelected = voice.id === selectedId;
            return (
              <TouchableRipple
                key={voice.id}
                onPress={() => handleSelect(voice)}
                testID={`tts-system-voice-${voice.id}`}>
                <View style={styles.row}>
                  <Text
                    style={[
                      styles.rowVoiceName,
                      isSelected && styles.rowVoiceNameSelected,
                    ]}>
                    {voice.name}
                  </Text>
                  <Button
                    mode="text"
                    compact
                    style={styles.previewButton}
                    testID={`tts-system-preview-${voice.id}`}
                    onPress={() => handlePreview(voice)}>
                    {l10n.voiceAndSpeech.previewButton}
                  </Button>
                </View>
              </TouchableRipple>
            );
          })
        )}
      </View>
    );
  },
);
