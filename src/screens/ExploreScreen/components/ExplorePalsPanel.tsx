import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {ActivityIndicator, FlatList, Linking, Text, View} from 'react-native';

import {observer} from 'mobx-react-lite';

import {Button} from '../../../components/ui';
import {CheckCircleIcon} from '../../../assets/icons';
import {PalDetailSheet} from '../../../components/PalsHub/PalDetailSheet';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {getPalsBrowseUrl} from '../../../utils/palshub-display';

import {palStore} from '../../../store';

import type {PalsHubPal, PalsQuery} from '../../../types/palshub';

import {ExploreFilterRow, type ExploreFilterKey} from './ExploreFilterRow';
import {ExploreSortControl} from './ExploreSortControl';
import {ExploreSearchInput, ExploreSearchToggle} from './ExploreSearch';
import {CategoryFilterSheet} from './CategoryFilterSheet';
import {PriceFilterSheet, type PriceRange} from './PriceFilterSheet';
import {TagsFilterSheet} from './TagsFilterSheet';
import {SortFilterSheet, type SortOption} from './SortFilterSheet';
import {PalCardList} from './PalCardList';
import {createPanelStyles} from './styles';

interface ExplorePalsPanelProps {
  onSignInPress?: () => void;
}

type OpenSheet = 'none' | 'categories' | 'price' | 'tags' | 'sort';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_SORT: SortOption = 'newest';

export const ExplorePalsPanel: React.FC<ExplorePalsPanelProps> = observer(
  ({onSignInPress}) => {
    const theme = useTheme();
    const styles = createPanelStyles(theme);
    const l10n = useContext(L10nContext);

    const [categoryIds, setCategoryIds] = useState<string[]>([]);
    const [priceRange, setPriceRange] = useState<PriceRange | null>(null);
    const [tagNames, setTagNames] = useState<string[]>([]);
    const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);
    const [searchInput, setSearchInput] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [searchExpanded, setSearchExpanded] = useState(false);
    const [openSheet, setOpenSheet] = useState<OpenSheet>('none');
    const [selectedPal, setSelectedPal] = useState<PalsHubPal | null>(null);
    const [showDetail, setShowDetail] = useState(false);

    // Accumulated results across pages; page 1 replaces, later pages append.
    const [items, setItems] = useState<PalsHubPal[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    // Monotonic query token. A resolved response is applied only if it is
    // still the latest issued query, so an earlier (slower) response cannot
    // overwrite a later one (last-query-wins).
    const seqRef = useRef(0);
    const pageRef = useRef(1);

    // Debounce the free-text input so we issue at most one request per pause,
    // instead of one per keystroke.
    useEffect(() => {
      const handle = setTimeout(() => {
        setDebouncedQuery(searchInput.trim());
      }, SEARCH_DEBOUNCE_MS);
      return () => clearTimeout(handle);
    }, [searchInput]);

    const buildQuery = useCallback(
      (page: number): PalsQuery => {
        const query: PalsQuery = {sort_by: sort, page};
        if (categoryIds.length > 0) {
          query.category_ids = categoryIds;
        }
        if (tagNames.length > 0) {
          query.tag_names = tagNames;
        }
        if (priceRange) {
          if (priceRange.min !== undefined) {
            query.price_min = priceRange.min;
          }
          if (priceRange.max !== undefined) {
            query.price_max = priceRange.max;
          }
        }
        if (debouncedQuery) {
          query.query = debouncedQuery;
        }
        return query;
      },
      [categoryIds, tagNames, priceRange, sort, debouncedQuery],
    );

    // Reset to the first page whenever a filter or the debounced query changes.
    useEffect(() => {
      const token = ++seqRef.current;
      pageRef.current = 1;
      setLoadingMore(false);
      (async () => {
        const response = await palStore.searchPalsHubPals(buildQuery(1));
        if (token !== seqRef.current) {
          return; // A newer query superseded this one.
        }
        setItems(response?.pals ?? []);
        setHasMore(response?.has_more ?? false);
      })();
    }, [buildQuery]);

    const loadMore = useCallback(async () => {
      if (loadingMore || !hasMore) {
        return;
      }
      const token = seqRef.current;
      const nextPage = pageRef.current + 1;
      setLoadingMore(true);
      const response = await palStore.searchPalsHubPals(buildQuery(nextPage));
      if (token !== seqRef.current) {
        return; // A filter/search change superseded this page fetch.
      }
      pageRef.current = nextPage;
      setItems(prev => [...prev, ...(response?.pals ?? [])]);
      setHasMore(response?.has_more ?? false);
      setLoadingMore(false);
    }, [buildQuery, hasMore, loadingMore]);

    const handleCardPress = (pal: PalsHubPal) => {
      // The detail sheet owns auth gating (routes to sign-in on purchase),
      // so the card simply opens it.
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
    if (tagNames.length > 0) {
      activeFilters.add('tags');
    }

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
      if (loadingMore) {
        return (
          <View style={styles.loadingMore} testID="explore-pals-loading-more">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        );
      }
      if (isLoading || items.length === 0 || hasMore) {
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
              Linking.openURL(getPalsBrowseUrl()).catch(error =>
                console.warn('Failed to open PalsHub browse URL:', error),
              );
            }}
          />
        </View>
      );
    };

    return (
      <View style={styles.container}>
        <ExploreFilterRow
          activeFilters={activeFilters}
          onOpen={key => setOpenSheet(key as OpenSheet)}
        />

        {searchExpanded && (
          <ExploreSearchInput
            query={searchInput}
            onChangeQuery={setSearchInput}
          />
        )}

        <View style={styles.availableHeader}>
          <Text style={styles.availableTitle}>
            {l10n.explore.availablePals}
          </Text>
          <View style={styles.availableEndSlot}>
            <ExploreSortControl
              sort={sort}
              onPress={() => setOpenSheet('sort')}
            />
            <ExploreSearchToggle
              expanded={searchExpanded}
              onToggle={() => setSearchExpanded(prev => !prev)}
            />
          </View>
        </View>

        <FlatList
          testID="explore-pals-list"
          data={items}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <PalCardList pal={item} onPress={handleCardPress} />
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
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

        <TagsFilterSheet
          isVisible={openSheet === 'tags'}
          selectedNames={tagNames}
          onClose={() => setOpenSheet('none')}
          onApply={names => {
            setTagNames(names);
            setOpenSheet('none');
          }}
        />

        <SortFilterSheet
          isVisible={openSheet === 'sort'}
          selected={sort}
          onClose={() => setOpenSheet('none')}
          onApply={value => {
            setSort(value);
            setOpenSheet('none');
          }}
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
