import React, {useContext} from 'react';
import {Text, View} from 'react-native';

import {Pressable} from '../../../components/ui/primitives/Pressable';
import {ChevronDownIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {createControlStyles} from './styles';

export type ExploreFilterKey = 'categories' | 'price' | 'tags';

interface ExploreFilterRowProps {
  activeFilters: Set<ExploreFilterKey>;
  onOpen: (key: ExploreFilterKey) => void;
}

export const ExploreFilterRow: React.FC<ExploreFilterRowProps> = ({
  activeFilters,
  onOpen,
}) => {
  const theme = useTheme();
  const styles = createControlStyles(theme);
  const l10n = useContext(L10nContext);

  const openers: {key: ExploreFilterKey; label: string}[] = [
    {key: 'categories', label: l10n.explore.categories},
    {key: 'price', label: l10n.explore.priceRange},
    {key: 'tags', label: l10n.explore.popularTags},
  ];

  return (
    <View style={styles.filterRow}>
      {openers.map(({key, label}) => {
        const active = activeFilters.has(key);
        return (
          <Pressable
            key={key}
            testID={`explore-filter-${key}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{selected: active}}
            onPress={() => onOpen(key)}
            style={[styles.opener, active ? styles.openerActive : null]}>
            <Text style={styles.openerLabel} numberOfLines={1}>
              {label}
            </Text>
            <ChevronDownIcon stroke={theme.colors.foregroundSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
};
