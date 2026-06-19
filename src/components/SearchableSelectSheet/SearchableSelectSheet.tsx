import React, {useMemo, useState} from 'react';
import {View, Text} from 'react-native';
import {BottomSheetFlatList} from '@gorhom/bottom-sheet';

import {CheckMdIcon, SearchIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {Pressable} from '../ui/primitives/Pressable';
import {Sheet} from '../Sheet';

import {createStyles} from './styles';

export type SearchableSelectOption = {
  value: string;
  label: string;
};

export type SearchableSelectSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  searchPlaceholder: string;
  options: SearchableSelectOption[];
  value: string;
  onSelect: (value: string) => void;
  testID?: string;
  searchTestID?: string;
  /** Row testIDs are `${optionTestIDPrefix}-${value}`. */
  optionTestIDPrefix?: string;
};

/**
 * Reusable searchable bottom-sheet selector. Stacks above an already-open
 * Sheet via @gorhom/bottom-sheet `stackBehavior="push"` (set on the shared
 * DS Sheet), so it works when opened from inside another sheet. Typing in
 * the search field filters options case-insensitively by label; the active
 * value is marked; tapping a row selects and closes.
 */
export const SearchableSelectSheet: React.FC<SearchableSelectSheetProps> = ({
  isVisible,
  onClose,
  title,
  searchPlaceholder,
  options,
  value,
  onSelect,
  testID = 'searchable-select-sheet',
  searchTestID = 'searchable-select-search',
  optionTestIDPrefix = 'searchable-select-option',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return options;
    }
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const handleSelect = (next: string) => {
    onSelect(next);
    onClose();
  };

  // Reset the query whenever the sheet is dismissed so a reopen starts clean.
  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const renderItem = ({item}: {item: SearchableSelectOption}) => {
    const selected = item.value === value;
    return (
      <Pressable
        testID={`${optionTestIDPrefix}-${item.value}`}
        accessibilityRole="button"
        accessibilityState={{selected}}
        accessibilityLabel={item.label}
        onPress={() => handleSelect(item.value)}
        style={styles.row}>
        <Text
          style={[styles.rowLabel, selected && styles.rowLabelSelected]}
          numberOfLines={1}>
          {item.label}
        </Text>
        {selected ? (
          <CheckMdIcon width={20} height={20} stroke={theme.colors.primary} />
        ) : null}
      </Pressable>
    );
  };

  return (
    <Sheet
      isVisible={isVisible}
      onClose={handleClose}
      title={title}
      snapPoints={['75%']}
      enablePanDownToClose
      enableContentPanningGesture={false}>
      {isVisible ? (
        <View testID={testID} style={styles.content}>
          <View style={styles.searchWrap}>
            <SearchIcon
              width={18}
              height={18}
              stroke={theme.colors.onSurfaceVariant}
            />
            <Sheet.TextInput
              testID={searchTestID}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <BottomSheetFlatList
            data={filtered}
            keyExtractor={item => item.value}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        </View>
      ) : null}
    </Sheet>
  );
};
