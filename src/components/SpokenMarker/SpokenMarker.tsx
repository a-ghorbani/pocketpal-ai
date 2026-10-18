import React, {useContext} from 'react';
import {StyleSheet, View} from 'react-native';

import {Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {VoiceWaveformIcon} from '../../assets/icons';

interface SpokenMarkerProps {
  /** Aligns the marker under a right-aligned (user) bubble. */
  alignEnd?: boolean;
}

/** Marks a chat row that was spoken in voice mode. */
export const SpokenMarker: React.FC<SpokenMarkerProps> = ({alignEnd}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const color = theme.colors.onSurfaceVariant;

  return (
    <View style={[styles.row, alignEnd && styles.end]} testID="spoken-marker">
      <VoiceWaveformIcon width={12} height={12} color={color} />
      <Text variant="labelSmall" style={{color}}>
        {l10n.voiceMode.spokenMarker}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  end: {
    alignSelf: 'flex-end',
  },
});
