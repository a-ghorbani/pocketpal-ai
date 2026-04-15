import React, {useContext} from 'react';
import {View} from 'react-native';
import {SegmentedButtons, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import type {SupertonicSteps} from '../../services/tts';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

const STEPS_OPTIONS: {value: string; label: string}[] = [
  {value: '1', label: '1'},
  {value: '2', label: '2'},
  {value: '3', label: '3'},
  {value: '5', label: '5'},
  {value: '10', label: '10'},
];

/**
 * Supertonic diffusion-steps selector. Rendered on the primary view only
 * when the current voice is Supertonic and the engine is installed.
 */
export const SupertonicStepsRow: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  return (
    <View style={styles.stepsRow} testID="tts-supertonic-steps-row">
      <Text style={styles.stepsLabel}>
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
  );
});
