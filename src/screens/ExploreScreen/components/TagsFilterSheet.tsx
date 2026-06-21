import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {Button, Chip} from '../../../components/ui';
import {Sheet} from '../../../components/Sheet';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import {palStore} from '../../../store';

import type {PalsHubTag} from '../../../types/palshub';

import {createSheetStyles} from './styles';

interface TagsFilterSheetProps {
  isVisible: boolean;
  selectedNames: string[];
  onClose: () => void;
  onApply: (tagNames: string[]) => void;
}

export const TagsFilterSheet: React.FC<TagsFilterSheetProps> = ({
  isVisible,
  selectedNames,
  onClose,
  onApply,
}) => {
  const theme = useTheme();
  const styles = createSheetStyles(theme);
  const l10n = useContext(L10nContext);

  const [tags, setTags] = useState<PalsHubTag[]>([]);
  const [selected, setSelected] = useState<string[]>(selectedNames);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    setSelected(selectedNames);
    palStore
      .getTags()
      .then(response => setTags(response.tags))
      .catch(() => setTags([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  // Single-select: the API filters by a single tag, so selecting a chip
  // replaces the current choice; tapping the active chip clears it.
  const select = (name: string) => {
    setSelected(prev => (prev.includes(name) ? [] : [name]));
  };

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onClose}
      title={l10n.explore.tags}
      snapPoints={['50%']}>
      <Sheet.ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          {tags.map(tag => (
            <Chip
              key={tag.id}
              testID={`explore-tag-chip-${tag.id}`}
              variant="selectable"
              selected={selected.includes(tag.name)}
              label={tag.name}
              accessibilityLabel={tag.name}
              onPress={() => select(tag.name)}
            />
          ))}
        </View>
      </Sheet.ScrollView>
      <Sheet.Actions>
        <View style={styles.actions}>
          <Button
            testID="explore-tags-clear"
            variant="tertiary"
            label={l10n.explore.clearFilters}
            onPress={() => setSelected([])}
          />
          <Button
            testID="explore-tags-apply"
            label={l10n.explore.apply}
            onPress={() => onApply(selected)}
          />
        </View>
      </Sheet.Actions>
    </Sheet>
  );
};
