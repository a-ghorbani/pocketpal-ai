import React, {useContext} from 'react';
import {ActivityIndicator, Image, View} from 'react-native';

import {Text, Chip, Tooltip} from 'react-native-paper';
import {observer} from 'mobx-react';
import {BottomSheetFlatList} from '@gorhom/bottom-sheet';

import {ModelTypeTag, Sheet} from '../../../../components';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';
import {ModelFileCard} from './ModelFileCard';
import {hfStore} from '../../../../store';

import {HuggingFaceModel, ModelFile} from '../../../../utils/types';
import {
  extractHFModelTitle,
  formatNumber,
  L10nContext,
  timeAgo,
  isVisionRepo,
  getLLMFiles,
} from '../../../../utils';

interface DetailsViewProps {
  hfModel: HuggingFaceModel;
}

export const DetailsView = observer(({hfModel}: DetailsViewProps) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const [avatarFailed, setAvatarFailed] = React.useState(false);

  // Check if this is a vision repository
  const isVision = isVisionRepo(hfModel.siblings || []);
  const sourceLabel = l10n.models.search.sources[hfModel.source || 'huggingface'];

  // Get LLM files (non-mmproj files) - projection models are hidden from UI
  const llmFiles = getLLMFiles(hfModel.siblings || []);
  const detailsError =
    hfStore.error?.context === 'modelDetails' ? hfStore.error : null;
  const showLoading = hfStore.modelDetailsLoading && llmFiles.length === 0;
  const showError = !showLoading && detailsError && llmFiles.length === 0;
  const showEmpty = !showLoading && !showError && llmFiles.length === 0;

  const renderItem = ({item}: {item: ModelFile}) => (
    <ModelFileCard key={item.rfilename} modelFile={item} hfModel={hfModel} />
  );

  const renderEmptyState = () => {
    if (showLoading) {
      return (
        <View style={styles.emptyStateContainer}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.emptyStateText}>
            {l10n.models.search.loadingMore}
          </Text>
        </View>
      );
    }

    if (showError) {
      return (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.errorText}>{detailsError.message}</Text>
        </View>
      );
    }

    if (showEmpty) {
      return (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>
            {l10n.models.search.noResults}
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <View style={styles.authorRow}>
          <View style={styles.avatarContainer}>
            {hfModel.avatarUrl && !avatarFailed ? (
              <Image
                source={{uri: hfModel.avatarUrl}}
                style={styles.avatar}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <Text style={styles.avatarText}>
                {hfModel.author.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
          <Text variant="headlineSmall" style={styles.modelAuthor}>
            {hfModel.author}
          </Text>
          <Chip compact mode="outlined" textStyle={styles.statText}>
            {sourceLabel}
          </Chip>
          {isVision && (
            <ModelTypeTag
              type="vision"
              label={l10n.models?.vision || 'Vision'}
              size="medium"
            />
          )}
        </View>
        <View style={styles.titleContainer}>
          <Tooltip title={hfModel.id}>
            <Text
              ellipsizeMode="middle"
              numberOfLines={1}
              variant="headlineSmall"
              style={styles.modelTitle}>
              {extractHFModelTitle(hfModel.id)}
            </Text>
          </Tooltip>
        </View>
        {hfModel.description && (
          <Text
            variant="bodySmall"
            style={styles.modelDescription}
            numberOfLines={3}>
            {hfModel.description}
          </Text>
        )}
        <View style={styles.modelStats}>
          <Chip
            icon="clock"
            compact
            style={styles.stat}
            textStyle={styles.statText}
            mode="outlined">
            {timeAgo(hfModel.lastModified, l10n, 'long')}
          </Chip>
          <Chip
            icon="download"
            compact
            style={styles.stat}
            textStyle={styles.statText}
            mode="outlined">
            {formatNumber(hfModel.downloads, 0)}
          </Chip>
          <Chip
            icon="heart"
            compact
            style={styles.stat}
            textStyle={styles.statText}
            mode="outlined">
            {formatNumber(hfModel.likes, 0)}
          </Chip>
          {hfModel.trendingScore > 20 && (
            <Chip
              icon="trending-up"
              style={styles.stat}
              compact
              mode="outlined">
              🔥
            </Chip>
          )}
        </View>
        <Text variant="titleLarge" style={styles.sectionTitle}>
          {l10n.models.details.title}
        </Text>
      </View>
      {llmFiles.length === 0 ? (
        renderEmptyState()
      ) : (
        <BottomSheetFlatList
          data={llmFiles}
          keyExtractor={(item: ModelFile) => item.rfilename}
          renderItem={renderItem}
          renderScrollComponent={props => (
            <Sheet.ScrollView bottomOffset={100} {...props} />
          )}
          contentContainerStyle={styles.list}
        />
      )}
      {/* TODO: Currently projection models are hidden from UI,
      we should add them to the model card like in a dropdown form.*/}
    </View>
  );
});
