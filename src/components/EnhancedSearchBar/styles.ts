import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
      minHeight: 60,
    },
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 6,
      height: 40,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.dark
        ? theme.colors.outline + '50'
        : theme.colors.outline + '30',
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      backgroundColor: 'transparent',
      paddingHorizontal: 0,
      paddingVertical: 0,
      height: 36,
      color: theme.colors.onSurface,
    },
    clearButton: {
      position: 'absolute',
      right: 8,
      top: '50%',
      transform: [{translateY: -12}],
      padding: 4,
      zIndex: 1,
    },
    filterToggleButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    filterToggleButtonActive: {
      backgroundColor: theme.colors.primaryContainer,
      borderColor: theme.colors.primary,
    },
    activeFilterIndicator: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.primary,
    },
    filterDropdownContainer: {
      marginBottom: 8,
    },
    filterDropdownContent: {
      paddingRight: 16,
      gap: 8,
    },
    filterDropdownButton: {
      flexDirection: 'row',
      alignItems: 'center',
      // backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.primary,
      gap: 4,
    },
    filterDropdownButtonActive: {
      backgroundColor: theme.colors.btnPrimaryBg,
      borderWidth: 0,
    },
    filterDropdownText: {
      color: theme.colors.onSurfaceVariant,
    },
    filterDropdownTextActive: {
      color: theme.colors.secondary,
      fontWeight: '600',
    },
    expandedFiltersContainer: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 12,
      padding: 16,
      marginTop: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
    },
    authorInputContainer: {
      position: 'relative',
      marginTop: 16,
      marginBottom: 40,
      marginHorizontal: 16,
    },
    authorInput: {
      backgroundColor: theme.colors.surface,
      fontSize: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      paddingHorizontal: 12,
      paddingRight: 44, // Make room for clear button
      minHeight: 40,
      color: theme.colors.onSurface,
    },
    selectorContainer: {
      flex: 1,
    },
    selectorButton: {
      backgroundColor: theme.colors.surface,
      borderRadius: 8,
      borderColor: theme.colors.outline,
    },

    filterSheetContent: {
      paddingBottom: 100,
    },
    filterOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
    },
    filterOptionText: {
      fontSize: 16,
      color: theme.colors.onSurface,
    },
  });
