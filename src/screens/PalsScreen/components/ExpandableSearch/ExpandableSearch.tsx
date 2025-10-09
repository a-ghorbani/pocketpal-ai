import React, {useState, useEffect, useCallback, useContext} from 'react';
import {View, Animated, TextInput, TouchableOpacity} from 'react-native';

import {observer} from 'mobx-react-lite';

import {SearchIcon, XIcon} from '../../../../assets/icons';

import {useTheme} from '../../../../hooks';
import {L10nContext} from '../../../../utils';

import {createStyles} from './styles';

import {palStore} from '../../../../store/PalStore';

import type {PalsHubPal} from '../../../../types/palshub';

interface ExpandableSearchProps {
  isExpanded: boolean;
  onToggle: () => void;
  onSearchResults: (results: PalsHubPal[]) => void;
}

export const ExpandableSearch: React.FC<ExpandableSearchProps> = observer(
  ({isExpanded, onToggle, onSearchResults}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const [searchQuery, setSearchQuery] = useState('');
    const [animatedHeight] = useState(new Animated.Value(0));

    useEffect(() => {
      Animated.timing(animatedHeight, {
        toValue: isExpanded ? 70 : 0,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }, [isExpanded, animatedHeight]);

    const performSearch = useCallback(async () => {
      if (!searchQuery.trim()) {
        onSearchResults([]);
        return;
      }

      try {
        await palStore.searchPalsHubPals({
          query: searchQuery,
        });
        // For now, use cached results since searchPalsHubPals updates the store
        onSearchResults(palStore.cachedPalsHubPals);
      } catch (error) {
        console.error('Search error:', error);
        onSearchResults([]);
      }
    }, [searchQuery, onSearchResults]);

    useEffect(() => {
      if (searchQuery.trim()) {
        const debounceTimer = setTimeout(performSearch, 300);
        return () => clearTimeout(debounceTimer);
      } else {
        onSearchResults([]);
      }
    }, [searchQuery, performSearch, onSearchResults]);

    const handleClose = () => {
      setSearchQuery('');
      onSearchResults([]);
      onToggle();
    };

    if (!isExpanded) {
      return null;
    }

    return (
      <Animated.View
        style={[styles.container, {height: animatedHeight}]}
        testID="expandable-search">
        <View style={styles.searchContent}>
          <View style={styles.searchInputContainer}>
            <SearchIcon
              stroke={theme.colors.onSurfaceVariant}
              width={20}
              height={20}
              style={styles.searchIcon}
            />
            <TextInput
              placeholder={l10n.palsScreen.searchAllPals}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              autoFocus={isExpanded}
              returnKeyType="search"
              testID="search-input"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
                testID="clear-search-button">
                <XIcon
                  stroke={theme.colors.onSurfaceVariant}
                  width={16}
                  height={16}
                />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.searchActions}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              testID="close-search-button">
              <XIcon
                stroke={theme.colors.onSurfaceVariant}
                width={18}
                height={18}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  },
);
