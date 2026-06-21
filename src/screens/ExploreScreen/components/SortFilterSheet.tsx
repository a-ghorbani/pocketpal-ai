import React, {useContext} from 'react';
import {View} from 'react-native';

import {Chip} from '../../../components/ui';
import {Sheet} from '../../../components/Sheet';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import type {PalsQuery} from '../../../types/palshub';

import {createSheetStyles} from './styles';

// 'rating' is omitted: the API maps it to the same ordering as 'popular', so
// the sheet offers only distinct orderings.
export type SortOption = Exclude<NonNullable<PalsQuery['sort_by']>, 'rating'>;

interface SortFilterSheetProps {
  isVisible: boolean;
  selected: SortOption;
  onClose: () => void;
  onApply: (sort: SortOption) => void;
}

export const SORT_OPTIONS: SortOption[] = [
  'newest',
  'oldest',
  'popular',
  'price_low',
  'price_high',
];

export const useSortLabel = () => {
  const l10n = useContext(L10nContext);
  return (sort: SortOption): string => {
    switch (sort) {
      case 'newest':
        return l10n.explore.sortNewest;
      case 'oldest':
        return l10n.explore.sortOldest;
      case 'popular':
        return l10n.explore.sortPopular;
      case 'price_low':
        return l10n.explore.sortPriceLow;
      case 'price_high':
        return l10n.explore.sortPriceHigh;
    }
  };
};

export const SortFilterSheet: React.FC<SortFilterSheetProps> = ({
  isVisible,
  selected,
  onClose,
  onApply,
}) => {
  const theme = useTheme();
  const styles = createSheetStyles(theme);
  const l10n = useContext(L10nContext);
  const labelFor = useSortLabel();

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onClose}
      title={l10n.explore.sortBy}
      snapPoints={['40%']}>
      <Sheet.ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          {SORT_OPTIONS.map(option => (
            <Chip
              key={option}
              testID={`explore-sort-chip-${option}`}
              variant="selectable"
              selected={selected === option}
              label={labelFor(option)}
              accessibilityLabel={labelFor(option)}
              onPress={() => onApply(option)}
            />
          ))}
        </View>
      </Sheet.ScrollView>
    </Sheet>
  );
};
