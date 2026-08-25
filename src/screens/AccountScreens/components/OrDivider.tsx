import React, {useContext} from 'react';
import {Text, View} from 'react-native';

import {useTheme} from '../../../hooks';

import {L10nContext} from '../../../utils';

import {createStyles} from '../styles';

export const OrDivider: React.FC = () => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>
        {l10n.settings.account.social.divider}
      </Text>
      <View style={styles.dividerLine} />
    </View>
  );
};
