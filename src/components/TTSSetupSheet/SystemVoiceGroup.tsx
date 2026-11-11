import React, {useContext} from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {CloudIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {systemSections, systemShownLanguages} from '../../services/tts';
import type {SystemVoiceRow, Voice} from '../../services/tts';
import {ttsStore, uiStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

export type RenderSystemRow = (
  row: SystemVoiceRow,
  accessibilityLabel: string,
) => React.ReactNode;

type SystemVoiceGroupProps = {
  voices: Voice[];
  renderRow: RenderSystemRow;
};

export const SystemVoiceGroup: React.FC<SystemVoiceGroupProps> = observer(
  ({voices, renderRow}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const needsInternet = l10n.voiceAndSpeech.systemNeedsInternet;
    const languages = systemShownLanguages({
      appLanguage: uiStore.language,
      currentVoice: ttsStore.currentVoice,
    });

    return (
      <>
        {systemSections(voices, languages).map(section => (
          <View key={section.key}>
            <View style={styles.systemBand}>
              <Text style={styles.systemBandTitle}>{section.title}</Text>
            </View>
            {section.onDevice.map(row => renderRow(row, row.label))}
            {section.network.length > 0 ? (
              <>
                <View
                  style={styles.systemSubHeader}
                  testID={`tts-system-network-header-${section.key}`}>
                  <CloudIcon
                    width={13}
                    height={13}
                    stroke={theme.colors.onSurfaceVariant}
                  />
                  <Text
                    style={[styles.systemSubHeaderText, styles.systemIconGap]}>
                    {needsInternet}
                  </Text>
                </View>
                {section.network.map(row =>
                  renderRow(row, `${row.label}, ${needsInternet}`),
                )}
              </>
            ) : null}
          </View>
        ))}
      </>
    );
  },
);
