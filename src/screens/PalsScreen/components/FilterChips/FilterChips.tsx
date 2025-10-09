import React from 'react';
import {View, ScrollView} from 'react-native';
import {Chip} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';
import {PAL_FILTER_LABELS} from '../../../../utils/palshub-display';

export type FilterType =
  | 'all'
  | 'my-pals'
  | 'local'
  | 'video'
  | 'free'
  | 'premium'; // Changed from 'paid' to 'premium'

interface FilterChipsProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  isAuthenticated: boolean;
}

interface FilterOption {
  key: FilterType;
  label: string;
  showWhenUnauthenticated?: boolean;
}

export const FilterChips: React.FC<FilterChipsProps> = observer(
  ({activeFilter, onFilterChange, isAuthenticated}) => {
    const theme = useTheme();
    const styles = createStyles(theme);

    const filterOptions: FilterOption[] = [
      {
        key: 'all',
        label: PAL_FILTER_LABELS.all,
        showWhenUnauthenticated: true,
      },
      {
        key: 'my-pals',
        label: PAL_FILTER_LABELS['my-pals'],
        showWhenUnauthenticated: false,
      },
      {
        key: 'local',
        label: PAL_FILTER_LABELS.local,
        showWhenUnauthenticated: true,
      },
      {
        key: 'video',
        label: PAL_FILTER_LABELS.video,
        showWhenUnauthenticated: true,
      },
      {
        key: 'free',
        label: PAL_FILTER_LABELS.free,
        showWhenUnauthenticated: true,
      },
      {
        key: 'premium',
        label: PAL_FILTER_LABELS.premium,
        showWhenUnauthenticated: true,
      },
    ];

    const visibleFilters = filterOptions.filter(
      option => isAuthenticated || option.showWhenUnauthenticated,
    );

    return (
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {visibleFilters.map(option => (
            <Chip
              testID={`filter-chip-${option.key}`}
              key={option.key}
              mode={activeFilter === option.key ? 'flat' : 'outlined'}
              selected={activeFilter === option.key}
              onPress={() => onFilterChange(option.key)}
              style={[
                styles.chip,
                activeFilter === option.key && styles.activeChip,
              ]}
              textStyle={[
                styles.chipText,
                activeFilter === option.key && styles.activeChipText,
              ]}
              compact>
              {option.label}
            </Chip>
          ))}
        </ScrollView>
      </View>
    );
  },
);
