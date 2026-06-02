import React, {
  useState,
  useContext,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {Image, TouchableOpacity, View} from 'react-native';

import {observer} from 'mobx-react';
import {Text, Chip, Button} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {BottomSheetFlatList} from '@gorhom/bottom-sheet';

import {
  Divider,
  EnhancedSearchBar,
  ModelTypeTag,
  Sheet,
} from '../../../../components';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';

import {hfStore} from '../../../../store';

import {HuggingFaceModel} from '../../../../utils/types';
import {
  extractHFModelTitle,
  formatNumber,
  timeAgo,
  L10nContext,
  isVisionRepo,
  formatBytes,
} from '../../../../utils';
import {ModelSourceId} from '../../../../utils/types';

interface SearchViewProps {
  testID?: string;
  onModelSelect: (model: HuggingFaceModel) => void;
  onChangeSearchQuery: (query: string) => void;
}

export const SearchView = observer(
  ({testID, onModelSelect, onChangeSearchQuery}: SearchViewProps) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);

    const styles = createStyles(theme);
    const [searchQuery, setSearchQuery] = useState(hfStore.searchQuery);
    const [failedAvatars, setFailedAvatars] = useState<Record<string, true>>(
      {},
    );
    const lastOnEndReachedCall = useRef<number>(0);

    const handleSearchChange = (query: string) => {
      setSearchQuery(query);
      hfStore.setSearchQuery(query);
      onChangeSearchQuery(query);
    };

    useEffect(() => {
      setSearchQuery(hfStore.searchQuery);
    }, [hfStore.searchQuery]);

    const handleFiltersChange = useCallback(
      (newFilters: Partial<typeof hfStore.searchFilters>) => {
        hfStore.setSearchFilters(newFilters);
        hfStore.fetchModels();
      },
      [],
    );

    const handleSourceChange = useCallback((source: ModelSourceId) => {
      hfStore.setSelectedSource(source);
      hfStore.fetchModels();
    }, []);

    const handleEndReached = useCallback(() => {
      const now = Date.now();
      const timeSinceLastCall = now - lastOnEndReachedCall.current;

      // Debounce onEndReached calls to prevent rapid successive calls
      if (timeSinceLastCall < 1000) {
        console.log('🔵 Debouncing onEndReached call');
        return;
      }

      lastOnEndReachedCall.current = now;
      console.log('onEndReached called');
      hfStore.fetchMoreModels();
    }, []);

    const renderItem = ({item}: {item: HuggingFaceModel}) => {
      // Check if this is a vision repository
      const isVision = isVisionRepo(item.siblings || []);
      const fileCount = item.siblings?.length || 0;
      const totalSize = (item.siblings || []).reduce(
        (sum, file) => sum + (file.size || file.lfs?.size || 0),
        0,
      );
      const modelSize = totalSize || item.modelSize || 0;
      const params = item.specs?.gguf?.total || 0;
      const sourceLabel =
        l10n.models.search.sources[item.source || 'huggingface'];
      const title = extractHFModelTitle(item.id);
      const avatarFailed = failedAvatars[item.id];

      return (
        <TouchableOpacity
          key={item.id}
          onPress={() => onModelSelect(item)}
          accessible={true}
          accessibilityLabel={`${item.author} ${title}`}
          testID={`hf-model-item-${item.source || 'huggingface'}-${item.id}`}>
          <View style={styles.modelRow}>
            <View style={styles.avatarContainer}>
              {item.avatarUrl && !avatarFailed ? (
                <Image
                  source={{uri: item.avatarUrl}}
                  style={styles.avatar}
                  onError={() =>
                    setFailedAvatars(previous => ({
                      ...previous,
                      [item.id]: true,
                    }))
                  }
                />
              ) : (
                <Text style={styles.avatarText}>
                  {(item.author || title).slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.modelContent}>
              <View style={styles.authorRow}>
                <Text variant="labelMedium" style={styles.modelAuthor}>
                  {item.author}
                </Text>
                <Chip compact mode="outlined" textStyle={styles.sourceChipText}>
                  {sourceLabel}
                </Chip>
              </View>
              <View style={styles.modelNameContainer}>
                <Text style={styles.modelName}>{title}</Text>
              </View>
              {item.description && (
                <Text
                  style={styles.modelDescription}
                  numberOfLines={2}
                  ellipsizeMode="tail">
                  {item.description}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.statsContainer}>
            {isVision && (
              <ModelTypeTag type="vision" label={l10n.models.vision} />
            )}
            <View style={styles.statItem}>
              <Icon
                name="clock-outline"
                size={12}
                color={theme.colors.onSurfaceVariant}
              />
              <Text variant="labelSmall" style={styles.statText}>
                {timeAgo(item.lastModified, l10n, 'short')}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Icon
                name="download-outline"
                size={12}
                color={theme.colors.onSurfaceVariant}
              />
              <Text variant="labelSmall" style={styles.statText}>
                {formatNumber(item.downloads)}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Icon
                name="heart-outline"
                size={12}
                color={theme.colors.onSurfaceVariant}
              />
              <Text variant="labelSmall" style={styles.statText}>
                {formatNumber(item.likes)}
              </Text>
            </View>
            {fileCount > 0 && (
              <View style={styles.statItem}>
                <Icon
                  name="file-cabinet"
                  size={12}
                  color={theme.colors.onSurfaceVariant}
                />
                <Text variant="labelSmall" style={styles.statText}>
                  {fileCount}
                  {totalSize > 0 ? ` / ${formatBytes(totalSize)}` : ''}
                </Text>
              </View>
            )}
            {fileCount === 0 && modelSize > 0 && (
              <View style={styles.statItem}>
                <Icon
                  name="harddisk"
                  size={12}
                  color={theme.colors.onSurfaceVariant}
                />
                <Text variant="labelSmall" style={styles.statText}>
                  {formatBytes(modelSize)}
                </Text>
              </View>
            )}
            {params > 0 && (
              <View style={styles.statItem}>
                <Icon
                  name="memory"
                  size={12}
                  color={theme.colors.onSurfaceVariant}
                />
                <Text variant="labelSmall" style={styles.statText}>
                  {formatNumber(params, 2, true, true)}
                </Text>
              </View>
            )}
            {Boolean(item.gated) && (
              <Chip compact mode="outlined" textStyle={styles.gatedChipText}>
                <Icon name="lock" size={12} color={theme.colors.primary} />{' '}
                {l10n.components.hfTokenSheet.gatedModelIndicator}
              </Chip>
            )}
          </View>
          <Divider style={styles.divider} />
        </TouchableOpacity>
      );
    };

    // Renders the appropriate empty state based on loading, error or no results
    const renderEmptyState = observer(() => {
      if (hfStore.isLoading) {
        console.log('renderEmptyState Loading');
        return null;
      }

      if (hfStore.error) {
        return (
          <View style={styles.emptyStateContainer}>
            <Icon
              name="alert-circle-outline"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
            <Text style={styles.noResultsText}>
              {l10n.models.search.errorOccurred}
            </Text>
            <Text style={styles.errorText}>{hfStore.error.message}</Text>
            {hfStore.error.code === 'authentication' && (
              <Text style={styles.errorHintText}>
                {hfStore.error.service === 'huggingface' ||
                hfStore.error.service === 'hf_mirror'
                  ? l10n.components.hfTokenSheet.searchErrorHint
                  : hfStore.error.message}
              </Text>
            )}
            {hfStore.error.code === 'authentication' &&
              hfStore.useHfToken &&
              (hfStore.error.service === 'huggingface' ||
                hfStore.error.service === 'hf_mirror') && (
                <Button
                  mode="outlined"
                  style={styles.disableTokenButton}
                  onPress={() => {
                    hfStore.setUseHfToken(false);
                    hfStore.clearError();
                    hfStore.fetchModels();
                  }}>
                  {l10n.components.hfTokenSheet.disableAndRetry}
                </Button>
              )}
          </View>
        );
      }

      if (searchQuery.length > 0) {
        return (
          <Text style={styles.noResultsText}>
            {l10n.models.search.noResults}
          </Text>
        );
      }

      return null;
    });

    return (
      <View style={styles.contentContainer} testID={testID}>
        <EnhancedSearchBar
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder={l10n.models.search.searchPlaceholder}
          filters={hfStore.searchFilters}
          onFiltersChange={filters => {
            handleFiltersChange(filters);
          }}
          source={hfStore.selectedSource}
          onSourceChange={handleSourceChange}
          testID="enhanced-search-bar"
        />
        <BottomSheetFlatList
          data={hfStore.models}
          keyExtractor={(item: HuggingFaceModel) =>
            `${item.source || 'huggingface'}-${item.id}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          renderScrollComponent={props => (
            <Sheet.ScrollView bottomOffset={100} {...props} />
          )}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={observer(() =>
            hfStore.isLoading ? (
              <Text style={styles.loadingMoreText}>
                {l10n.models.search.loadingMore}
              </Text>
            ) : null,
          )}
        />
      </View>
    );
  },
);
