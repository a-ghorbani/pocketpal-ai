import React, {useContext} from 'react';
import {Linking, Text, View} from 'react-native';

import {useTheme} from '../../../hooks';

import {L10nContext} from '../../../utils';
import {LEGAL_URLS} from '../../../utils/legalUrls';

import {createStyles} from '../styles';

export const LegalFooter: React.FC = () => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.legalRow}>
      <Text style={styles.legalText}>{l10n.settings.account.legal.prefix}</Text>
      <Text
        style={styles.legalLink}
        onPress={() => Linking.openURL(LEGAL_URLS.termsOfService)}>
        {l10n.about.termsOfService}
      </Text>
      <Text style={styles.legalText}>·</Text>
      <Text
        style={styles.legalLink}
        onPress={() => Linking.openURL(LEGAL_URLS.privacyPolicy)}>
        {l10n.about.privacyPolicy}
      </Text>
    </View>
  );
};
