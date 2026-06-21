import React, {useContext} from 'react';
import {Text} from 'react-native';

import {Pressable} from '../../../components/ui/primitives/Pressable';
import {ChevronDownIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {createControlStyles} from './styles';
import {useSortLabel, type SortOption} from './SortFilterSheet';

interface ExploreSortControlProps {
  sort: SortOption;
  onPress: () => void;
}

export const ExploreSortControl: React.FC<ExploreSortControlProps> = ({
  sort,
  onPress,
}) => {
  const theme = useTheme();
  const styles = createControlStyles(theme);
  const l10n = useContext(L10nContext);
  const labelFor = useSortLabel();

  return (
    <Pressable
      style={styles.sortControl}
      testID="explore-sort-control"
      accessibilityRole="button"
      accessibilityLabel={l10n.explore.sortBy}
      onPress={onPress}>
      <Text style={styles.sortLabel}>{labelFor(sort)}</Text>
      <ChevronDownIcon stroke={theme.colors.foregroundSecondary} />
    </Pressable>
  );
};
