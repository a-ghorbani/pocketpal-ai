import React, {useContext, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable as RNPressable,
  Text,
  View,
} from 'react-native';
import {Portal} from 'react-native-paper';

import {Input} from '../../../components/ui';
import {Surface} from '../../../components/ui/Surface';
import {Pressable} from '../../../components/ui/primitives/Pressable';
import {CloseIcon, SearchIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';

import type {PalsHubPal} from '../../../types/palshub';

import {ExploreSearchResultRow} from './ExploreSearchResultRow';
import {createSearchOverlayStyles} from './styles';

interface ExploreSearchOverlayProps {
  searchInput: string;
  onChangeSearchInput: (query: string) => void;
  debouncedQuery: string;
  isLoading: boolean;
  items: PalsHubPal[];
  onClose: () => void;
  onResultPress: (pal: PalsHubPal) => void;
}

export const ExploreSearchOverlay: React.FC<ExploreSearchOverlayProps> = ({
  searchInput,
  onChangeSearchInput,
  debouncedQuery,
  isLoading,
  items,
  onClose,
  onResultPress,
}) => {
  const theme = useTheme();
  const styles = createSearchOverlayStyles(theme);
  const l10n = useContext(L10nContext);
  const [focused, setFocused] = useState(false);

  const renderBody = () => {
    if (debouncedQuery === '') {
      return (
        <View style={styles.promptBody} testID="explore-search-prompt">
          <Text style={styles.promptTitle}>
            {l10n.explore.searchPromptTitle}
          </Text>
          <Text style={styles.promptText}>{l10n.explore.searchPromptBody}</Text>
        </View>
      );
    }

    if (isLoading) {
      return (
        <View style={styles.loadingBody} testID="explore-search-loading">
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }

    if (items.length === 0) {
      // `searchPalsHubPals` swallows backend failures and returns an empty
      // response (PalStore.searchPalsHubPals catch), so a failed fetch is
      // indistinguishable from a genuine zero-results here. The helper copy
      // stays neutral rather than asserting "no matches"; surfacing a real
      // error/retry state needs a store-level error signal (follow-up).
      const [before, after] = l10n.explore.searchNoResults.split('{{query}}');
      return (
        <View style={styles.noResultsBody} testID="explore-search-no-results">
          <Text style={styles.noResultsTitle}>
            {before}
            <Text style={styles.noResultsQuery}>{debouncedQuery}</Text>
            {after}
          </Text>
          <Text style={styles.noResultsHelper}>
            {l10n.explore.searchNoResultsHelper}
          </Text>
          <Pressable
            testID="explore-search-explore-cta"
            accessibilityRole="button"
            accessibilityLabel={l10n.explore.searchExploreCta}
            onPress={onClose}
            style={styles.exploreCta}>
            <Text style={styles.exploreCtaText}>
              {l10n.explore.searchExploreCta}
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.resultsBody}>
        <Text
          style={styles.resultsHeader}
          testID="explore-search-results-header">
          {l10n.explore.searchResultsHeader}
        </Text>
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({item}) => (
            <ExploreSearchResultRow pal={item} onPress={onResultPress} />
          )}
        />
      </View>
    );
  };

  return (
    <Portal>
      <View style={styles.overlayWrapper}>
        <RNPressable
          testID="explore-search-scrim"
          accessibilityRole="button"
          accessibilityLabel={l10n.common.close}
          onPress={onClose}
          style={styles.scrim}
        />
        <Surface
          testID="explore-search-overlay"
          radius="l"
          elevation={3}
          style={styles.card}>
          <View
            style={[
              styles.inputWrapper,
              focused && styles.inputWrapperFocused,
            ]}>
            <Input
              testID="explore-search-input"
              value={searchInput}
              onChangeText={onChangeSearchInput}
              placeholder={l10n.explore.searchPlaceholder}
              accessibilityLabel={l10n.explore.searchLabel}
              style={styles.input}
              inputProps={{
                autoFocus: true,
                onFocus: () => setFocused(true),
                onBlur: () => setFocused(false),
              }}
              leading={<SearchIcon stroke={theme.colors.foregroundSecondary} />}
              trailing={
                searchInput !== '' ? (
                  <Pressable
                    testID="explore-search-clear"
                    accessibilityRole="button"
                    accessibilityLabel={l10n.common.clear}
                    hitSlop={10}
                    onPress={() => onChangeSearchInput('')}>
                    <CloseIcon stroke={theme.colors.foregroundSecondary} />
                  </Pressable>
                ) : undefined
              }
            />
          </View>

          {renderBody()}
        </Surface>
      </View>
    </Portal>
  );
};
