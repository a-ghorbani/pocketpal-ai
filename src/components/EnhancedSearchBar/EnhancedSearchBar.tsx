import React, {useState, useContext, useCallback, useMemo} from 'react';
import {View, TouchableOpacity, ScrollView, TextInput} from 'react-native';

import {Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';

import {Sheet} from '..';
import {createStyles} from './styles';

import {L10nContext} from '../../utils';
import {XIcon} from '../../assets/icons';

import {SortOption, SearchFilters} from '../../store/HFStore';

interface EnhancedSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  containerStyle?: object;
  filters: SearchFilters;
  onFiltersChange: (filters: Partial<SearchFilters>) => void;
  testID?: string;
}

type FilterType = 'author' | 'sort';

export const EnhancedSearchBar = ({
  value,
  onChangeText,
  placeholder,
  containerStyle,
  filters,
  onFiltersChange,
  testID,
}: EnhancedSearchBarProps) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const [activeFilterSheet, setActiveFilterSheet] = useState<FilterType | null>(
    null,
  );

  // Filter options - memoized to prevent recreating on every render

  const sortOptions = useMemo(
    () => [
      {
        value: 'relevance' as SortOption,
        label: l10n.models.search.filters.sortRelevance,
      },
      {
        value: 'downloads' as SortOption,
        label: l10n.models.search.filters.sortDownloads,
      },
      {
        value: 'lastModified' as SortOption,
        label: l10n.models.search.filters.sortRecent,
      },
      {
        value: 'likes' as SortOption,
        label: l10n.models.search.filters.sortLikes,
      },
    ],
    [l10n],
  );

  const openFilterSheet = useCallback((filterType: FilterType) => {
    setActiveFilterSheet(filterType);
  }, []);

  const closeFilterSheet = useCallback(() => {
    setActiveFilterSheet(null);
  }, []);

  const getFilterDisplayValue = useCallback(
    (filterType: FilterType): string => {
      switch (filterType) {
        case 'author':
          return filters.author || l10n.models.search.filters.author;
        case 'sort':
          const sortOption = sortOptions.find(
            opt => opt.value === filters.sortBy,
          );
          return sortOption?.label || l10n.models.search.filters.sortBy;
        default:
          return '';
      }
    },
    [filters, sortOptions, l10n],
  );

  const isFilterActive = useCallback(
    (filterType: FilterType): boolean => {
      switch (filterType) {
        case 'author':
          return !!filters.author;
        case 'sort':
          return filters.sortBy !== 'relevance';
        default:
          return false;
      }
    },
    [filters],
  );

  // Memoized callback for clearing search
  const handleClearSearch = useCallback(() => {
    onChangeText('');
  }, [onChangeText]);

  // Memoized callbacks for filter selections

  const handleSortFilterSelect = useCallback(
    (filterValue: SortOption) => {
      onFiltersChange({sortBy: filterValue});
      closeFilterSheet();
    },
    [onFiltersChange, closeFilterSheet],
  );

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {/* Main Search Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInputContainer}>
          <Icon
            name="magnify"
            size={20}
            color={theme.colors.onSurfaceVariant}
            style={styles.searchIcon}
          />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder || l10n.models.search.searchPlaceholder}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={styles.searchInput}
          />
          {value.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              style={styles.clearButton}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon
                name="close"
                size={20}
                color={theme.colors.onSurfaceVariant}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Dropdown Buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterDropdownContainer}
        contentContainerStyle={styles.filterDropdownContent}>
        {/* Author Filter Button */}
        <TouchableOpacity
          testID="filter-button-author"
          onPress={() => openFilterSheet('author')}
          style={[
            styles.filterDropdownButton,
            isFilterActive('author') && styles.filterDropdownButtonActive,
          ]}>
          <Text
            variant="labelMedium"
            style={[
              styles.filterDropdownText,
              isFilterActive('author') && styles.filterDropdownTextActive,
            ]}>
            {getFilterDisplayValue('author')}
          </Text>
          <Icon
            name="chevron-down"
            size={16}
            color={
              isFilterActive('author')
                ? theme.colors.primary
                : theme.colors.onSurfaceVariant
            }
          />
        </TouchableOpacity>

        {/* Sort Filter Button */}
        <TouchableOpacity
          testID="filter-button-sort"
          onPress={() => openFilterSheet('sort')}
          style={[
            styles.filterDropdownButton,
            isFilterActive('sort') && styles.filterDropdownButtonActive,
          ]}>
          <Text
            style={[
              styles.filterDropdownText,
              isFilterActive('sort') && styles.filterDropdownTextActive,
            ]}>
            {getFilterDisplayValue('sort')}
          </Text>
          <Icon
            name="chevron-down"
            size={16}
            color={
              isFilterActive('sort')
                ? theme.colors.primary
                : theme.colors.onSurfaceVariant
            }
          />
        </TouchableOpacity>
      </ScrollView>

      {/* Filter Sheets */}
      <Sheet
        isVisible={activeFilterSheet === 'author'}
        onClose={closeFilterSheet}
        title={l10n.models.search.filters.author}>
        <Sheet.ScrollView
          bottomOffset={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.sheetScrollContent}>
          <View style={styles.authorInputContainer}>
            <TextInput
              defaultValue={filters.author}
              // value={filters.author}
              onChangeText={author => onFiltersChange({author})}
              placeholder={l10n.models.search.filters.authorPlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              style={styles.authorInput}
              autoFocus
            />
            {filters.author.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                onPress={() => onFiltersChange({author: ''})}>
                <XIcon
                  width={20}
                  height={20}
                  fill={theme.colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            )}
          </View>
        </Sheet.ScrollView>
      </Sheet>

      <Sheet
        isVisible={activeFilterSheet === 'sort'}
        onClose={closeFilterSheet}
        title={l10n.models.search.filters.sortBy}>
        <Sheet.View style={styles.filterSheetContent}>
          {sortOptions.map(option => {
            const isSelected = filters.sortBy === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => handleSortFilterSelect(option.value)}
                style={[
                  styles.filterOption,
                  isSelected && styles.filterOptionSelected,
                ]}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.filterOptionText,
                    isSelected && styles.filterOptionTextSelected,
                  ]}>
                  {option.label}
                </Text>
                {isSelected && (
                  <Icon
                    name="check-circle"
                    size={24}
                    color={theme.colors.primary}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </Sheet.View>
      </Sheet>
    </View>
  );
};
