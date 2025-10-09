import React, {
  useState,
  useContext,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import {
  Keyboard,
  Platform,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';

import {Text} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';

import {Sheet} from '../Sheet';
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);
  const insets = useSafeAreaInsets();

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
              style={styles.clearButton}>
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
        <Sheet.View
          // eslint-disable-next-line react-native/no-inline-styles
          style={{paddingBottom: keyboardVisible ? 0 : insets.bottom}}>
          <View style={styles.authorInputContainer}>
            <Sheet.TextInput
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
                onPress={() => onFiltersChange({author: ''})}>
                <XIcon
                  width={20}
                  height={20}
                  fill={theme.colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            )}
          </View>
        </Sheet.View>
      </Sheet>

      <Sheet
        isVisible={activeFilterSheet === 'sort'}
        onClose={closeFilterSheet}
        title={l10n.models.search.filters.sortBy}>
        <Sheet.View style={styles.filterSheetContent}>
          {sortOptions.map(option => (
            <TouchableOpacity
              key={option.value}
              onPress={() => handleSortFilterSelect(option.value)}
              style={styles.filterOption}>
              <Text style={styles.filterOptionText}>{option.label}</Text>
              {filters.sortBy === option.value && (
                <Icon name="check" size={20} color={theme.colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </Sheet.View>
      </Sheet>
    </View>
  );
};
