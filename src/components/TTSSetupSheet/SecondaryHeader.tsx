import React, {useContext} from 'react';
import {View} from 'react-native';
import {IconButton, Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

interface SecondaryHeaderProps {
  title: string;
  onBack: () => void;
  testID?: string;
}

/**
 * Chevron-left + title row used at the top of secondary in-sheet views
 * (Browse voices, Manage engines). The sheet's own close button stays
 * above this in the sheet chrome.
 */
export const SecondaryHeader: React.FC<SecondaryHeaderProps> = ({
  title,
  onBack,
  testID,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  return (
    <View style={styles.secondaryHeader} testID={testID}>
      <IconButton
        icon="chevron-left"
        size={24}
        onPress={onBack}
        accessibilityLabel={l10n.voiceAndSpeech.backButton}
        testID={testID ? `${testID}-back` : 'tts-secondary-back'}
      />
      <Text style={styles.secondaryHeaderTitle}>{title}</Text>
    </View>
  );
};
