import React, {useContext} from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {useFormContext, Controller} from 'react-hook-form';

import {useTheme} from '../../hooks';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {Dropdown, Switch} from '../ui';
import {createStyles} from './styles';
import {SectionDivider} from './SectionDivider';
import type {PalFormData} from './types';

/**
 * Engines a Pal can pin for its spoken replies. Order mirrors the TTS
 * setup sheet. Phonon is disabled (not hidden) when the device probe says
 * it is unsupported, so users can see it exists but cannot select a
 * dead-end engine.
 */
const PAL_TTS_ENGINES = [
  {value: 'kokoro', chipKey: 'engineChipKokoro'},
  {value: 'kitten', chipKey: 'engineChipKitten'},
  {value: 'supertonic', chipKey: 'engineChipSupertonic'},
  {value: 'phonon', chipKey: 'engineChipPhonon'},
  {value: 'system', chipKey: 'engineChipSystem'},
] as const;

/**
 * Voice section in the Pal edit sheet: the per-Pal "Speak responses aloud"
 * switch and a TTS engine override dropdown. TTS is a downstream consumer
 * of text — this applies to text, image and video Pals alike. An unset
 * engine ("Follow app voice") speaks with the app-wide voice selected in
 * TTS settings.
 */
export const VoiceSection = observer(() => {
  const {control} = useFormContext<PalFormData>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const labels = l10n.components.palSheet.voice;
  const engineLabels = l10n.voiceAndSpeech;

  return (
    <View testID="voice-section">
      <SectionDivider label={labels.sectionLabel} />
      <Controller
        control={control}
        name="voiceEnabled"
        render={({field: {onChange, value}}) => (
          <View style={styles.talentItem} testID="pal-voice-enabled-row">
            <View style={styles.talentInfo}>
              <Text variant="bodyMedium">{labels.speakLabel}</Text>
              <Text variant="bodySmall" style={styles.talentDescription}>
                {labels.speakDescription}
              </Text>
            </View>
            <Switch
              testID="pal-voice-enabled-switch"
              value={value !== false}
              onValueChange={onChange}
              accessibilityLabel={labels.speakLabel}
            />
          </View>
        )}
      />
      <Controller
        control={control}
        name="ttsEngine"
        render={({field: {onChange, value}}) => (
          <View style={styles.voiceEngineField} testID="pal-tts-engine-row">
            <Text variant="bodyMedium">{labels.engineLabel}</Text>
            <Dropdown
              testID="pal-tts-engine-dropdown"
              accessibilityLabel={labels.engineLabel}
              value={value ?? 'default'}
              onChange={v => onChange(v === 'default' ? undefined : v)}
              options={[
                {
                  value: 'default',
                  label: labels.engineDefaultOption,
                },
                ...PAL_TTS_ENGINES.map(engine => ({
                  value: engine.value,
                  label: engineLabels[engine.chipKey],
                  disabled:
                    engine.value === 'phonon' &&
                    !ttsStore.isEngineOffered('phonon'),
                })),
              ]}
            />
          </View>
        )}
      />
    </View>
  );
});
