import React, {useContext} from 'react';
import {View} from 'react-native';

import {Input} from '../../../components/ui';
import {Pressable} from '../../../components/ui/primitives/Pressable';
import {SearchIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {createControlStyles} from './styles';

interface ExploreSearchProps {
  expanded: boolean;
  query: string;
  onToggle: () => void;
  onChangeQuery: (query: string) => void;
}

export const ExploreSearchToggle: React.FC<
  Pick<ExploreSearchProps, 'expanded' | 'onToggle'>
> = ({expanded, onToggle}) => {
  const theme = useTheme();
  const styles = createControlStyles(theme);
  const l10n = useContext(L10nContext);

  return (
    <Pressable
      testID="explore-search-toggle"
      accessibilityRole="button"
      accessibilityLabel={l10n.explore.searchLabel}
      accessibilityState={{expanded}}
      onPress={onToggle}
      style={styles.searchButton}>
      <SearchIcon stroke={theme.colors.foregroundSecondary} />
    </Pressable>
  );
};

export const ExploreSearchInput: React.FC<
  Pick<ExploreSearchProps, 'query' | 'onChangeQuery'>
> = ({query, onChangeQuery}) => {
  const theme = useTheme();
  const styles = createControlStyles(theme);
  const l10n = useContext(L10nContext);

  return (
    <View style={styles.searchInput}>
      <Input
        testID="explore-search-input"
        value={query}
        onChangeText={onChangeQuery}
        placeholder={l10n.explore.searchPlaceholder}
        accessibilityLabel={l10n.explore.searchLabel}
      />
    </View>
  );
};
