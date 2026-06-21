import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {Button, Chip} from '../../../components/ui';
import {Sheet} from '../../../components/Sheet';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {palStore} from '../../../store';

import type {PalsHubCategory} from '../../../types/palshub';

import {createSheetStyles} from './styles';

interface CategoryFilterSheetProps {
  isVisible: boolean;
  selectedIds: string[];
  onClose: () => void;
  onApply: (categoryIds: string[]) => void;
}

export const CategoryFilterSheet: React.FC<CategoryFilterSheetProps> = ({
  isVisible,
  selectedIds,
  onClose,
  onApply,
}) => {
  const theme = useTheme();
  const styles = createSheetStyles(theme);
  const l10n = useContext(L10nContext);

  const [categories, setCategories] = useState<PalsHubCategory[]>([]);
  const [selected, setSelected] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    setSelected(selectedIds);
    palStore
      .getCategories()
      .then(response => setCategories(response.categories))
      .catch(() => setCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id],
    );
  };

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onClose}
      title={l10n.explore.categories}
      snapPoints={['50%']}>
      <Sheet.ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          {categories.map(category => (
            <Chip
              key={category.id}
              testID={`explore-category-chip-${category.id}`}
              variant="selectable"
              selected={selected.includes(category.id)}
              label={category.name}
              accessibilityLabel={category.name}
              onPress={() => toggle(category.id)}
            />
          ))}
        </View>
      </Sheet.ScrollView>
      <Sheet.Actions>
        <View style={styles.actions}>
          <Button
            testID="explore-category-clear"
            variant="tertiary"
            label={l10n.explore.clearFilters}
            onPress={() => setSelected([])}
          />
          <Button
            testID="explore-category-apply"
            label={l10n.explore.apply}
            onPress={() => onApply(selected)}
          />
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
