import React, {useContext} from 'react';
import {Text, View} from 'react-native';

import {ChevronDownIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {createControlStyles} from './styles';

export const ExploreSortControl: React.FC = () => {
  const theme = useTheme();
  const styles = createControlStyles(theme);
  const l10n = useContext(L10nContext);

  return (
    <View style={styles.sortControl} testID="explore-sort-control">
      <Text style={styles.sortLabel}>{l10n.explore.mostRelevant}</Text>
      <ChevronDownIcon stroke={theme.colors.foregroundSecondary} />
    </View>
  );
};
