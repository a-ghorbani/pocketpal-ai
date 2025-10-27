import React, {useContext} from 'react';
import {View} from 'react-native';

import {Text, Chip, Tooltip} from 'react-native-paper';
import {BottomSheetFlatList} from '@gorhom/bottom-sheet';

import {ModelTypeTag, Sheet} from '../../../../components';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';
import {ModelFileCard} from './ModelFileCard';

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

export const DetailsView = ({hfModel}: DetailsViewProps) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  // Check if this is a vision repository
  const isVision = isVisionRepo(hfModel.siblings || []);

  // Get LLM files (non-mmproj files) - projection models are hidden from UI
  const llmFiles = getLLMFiles(hfModel.siblings || []);

  const renderItem = ({item}: {item: ModelFile}) => (
    <ModelFileCard key={item.rfilename} modelFile={item} hfModel={hfModel} />
  );

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <View style={styles.authorRow}>
          <Text variant="headlineSmall" style={styles.modelAuthor}>
            {hfModel.author}
          </Text>
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
      <BottomSheetFlatList
        data={llmFiles}
        keyExtractor={(item: ModelFile) => item.rfilename}
        renderItem={renderItem}
        renderScrollComponent={props => (
          <Sheet.ScrollView bottomOffset={100} {...props} />
        )}
        contentContainerStyle={styles.list}
      />
      {/* TODO: Currently projection models are hidden from UI,
      we should add them to the model card like in a dropdown form.*/}
    </View>
  );
};
