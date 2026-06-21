import React, {useContext} from 'react';

import {Pressable} from '../../../components/ui/primitives/Pressable';
import {SearchIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {createControlStyles} from './styles';

interface ExploreSearchProps {
  expanded: boolean;
  onToggle: () => void;
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
