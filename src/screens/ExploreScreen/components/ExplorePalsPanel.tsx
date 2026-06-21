import React, {useCallback, useContext, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Linking, Text, View} from 'react-native';

import {observer} from 'mobx-react-lite';

import {Button} from '../../../components/ui';
import {CheckCircleIcon} from '../../../assets/icons';
import {PalDetailSheet} from '../../../components/PalsHub/PalDetailSheet';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {getPalBuyUrl} from '../../../utils/palshub-display';

import {palStore} from '../../../store';

import type {PalsHubPal, PalsQuery} from '../../../types/palshub';

import {ExploreFilterRow, type ExploreFilterKey} from './ExploreFilterRow';
import {ExploreSortControl} from './ExploreSortControl';
import {ExploreSearchInput, ExploreSearchToggle} from './ExploreSearch';
import {CategoryFilterSheet} from './CategoryFilterSheet';
import {PriceFilterSheet, type PriceRange} from './PriceFilterSheet';
import {LoginRequiredModal} from './LoginRequiredModal';
import {PalCardList} from './PalCardList';
import {createPanelStyles} from './styles';

interface ExplorePalsPanelProps {
  isAuthenticated: boolean;
  onSignInPress?: () => void;
}

type OpenSheet = 'none' | 'categories' | 'price';

export const ExplorePalsPanel: React.FC<ExplorePalsPanelProps> = observer(
  ({isAuthenticated, onSignInPress}) => {
    const theme = useTheme();
    const styles = createPanelStyles(theme);
    const l10n = useContext(L10nContext);

    const [categoryIds, setCategoryIds] = useState<string[]>([]);
    const [priceRange, setPriceRange] = useState<PriceRange | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchExpanded, setSearchExpanded] = useState(false);
    const [openSheet, setOpenSheet] = useState<OpenSheet>('none');
    const [showLoginRequired, setShowLoginRequired] = useState(false);
    const [selectedPal, setSelectedPal] = useState<PalsHubPal | null>(null);
    const [showDetail, setShowDetail] = useState(false);
    // has_more is returned on the resolved response only; PalStore persists
    // just the pals, so the reached-the-end signal is read off the response.
    const [hasMore, setHasMore] = useState(true);

    const runSearch = useCallback(async () => {
      const query: PalsQuery = {};
      if (categoryIds.length > 0) {
        query.category_ids = categoryIds;
      }
      if (priceRange) {
        if (priceRange.min !== undefined) {
          query.price_min = priceRange.min;
        }
        if (priceRange.max !== undefined) {
          query.price_max = priceRange.max;
        }
      }
      if (searchQuery.trim()) {
        query.query = searchQuery.trim();
      }
      const response = await palStore.searchPalsHubPals(query);
      setHasMore(response?.has_more ?? false);
    }, [categoryIds, priceRange, searchQuery]);

    useEffect(() => {
      runSearch();
    }, [runSearch]);

    const handleCardPress = (pal: PalsHubPal) => {
      const gated = pal.price_cents > 0 && !pal.is_owned;
      if (gated && !isAuthenticated) {
        setShowLoginRequired(true);
        return;
      }
      setSelectedPal(pal);
      setShowDetail(true);
    };

    const activeFilters = new Set<ExploreFilterKey>();
    if (categoryIds.length > 0) {
      activeFilters.add('categories');
    }
    if (priceRange) {
      activeFilters.add('price');
    }

    const pals = palStore.cachedPalsHubPals;
    const isLoading = palStore.isLoadingPalsHub;

    const renderEmpty = () => {
      if (isLoading) {
        return (
          <View style={styles.loading} testID="explore-pals-loading">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        );
      }
      return (
        <View style={styles.empty} testID="explore-pals-empty">
          <Text style={styles.emptyText}>{l10n.explore.noPalsFound}</Text>
        </View>
      );
    };

    const renderFooter = () => {
      if (isLoading || pals.length === 0 || hasMore) {
        return null;
      }
      return (
        <View style={styles.end} testID="explore-pals-end">
          <CheckCircleIcon stroke={theme.colors.primary} />
          <Text style={styles.endTitle}>{l10n.explore.reachedTheEndTitle}</Text>
          <Text style={styles.endSubtitle}>
            {l10n.explore.reachedTheEndSubtitle}
          </Text>
          <Button
            testID="explore-browse-palshub"
            variant="secondary"
            label={l10n.explore.browseOnPalshub}
            style={styles.endButton}
            onPress={() => {
              Linking.openURL(getPalBuyUrl('')).catch(() => {});
            }}
          />
        </View>
      );
    };

    return (
      <View style={styles.container}>
        <ExploreFilterRow
          activeFilters={activeFilters}
          onOpen={key =>
            key === 'tags' ? undefined : setOpenSheet(key as OpenSheet)
          }
        />

        {searchExpanded && (
          <ExploreSearchInput
            query={searchQuery}
            onChangeQuery={setSearchQuery}
          />
        )}

        <View style={styles.availableHeader}>
          <Text style={styles.availableTitle}>
            {l10n.explore.availablePals}
          </Text>
          <View style={styles.availableEndSlot}>
            <ExploreSortControl />
            <ExploreSearchToggle
              expanded={searchExpanded}
              onToggle={() => setSearchExpanded(prev => !prev)}
            />
          </View>
        </View>

        <FlatList
          testID="explore-pals-list"
          data={pals}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <PalCardList pal={item} onPress={handleCardPress} />
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
        />

        <CategoryFilterSheet
          isVisible={openSheet === 'categories'}
          selectedIds={categoryIds}
          onClose={() => setOpenSheet('none')}
          onApply={ids => {
            setCategoryIds(ids);
            setOpenSheet('none');
          }}
        />

        <PriceFilterSheet
          isVisible={openSheet === 'price'}
          selected={priceRange}
          onClose={() => setOpenSheet('none')}
          onApply={range => {
            setPriceRange(range);
            setOpenSheet('none');
          }}
        />

        <LoginRequiredModal
          isVisible={showLoginRequired}
          onClose={() => setShowLoginRequired(false)}
          onSignInPress={onSignInPress}
        />

        {selectedPal && (
          <PalDetailSheet
            isVisible={showDetail}
            pal={selectedPal}
            onSignInPress={onSignInPress}
            onClose={() => {
              setShowDetail(false);
              setSelectedPal(null);
            }}
          />
        )}
      </View>
    );
  },
);
