import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {Text, Chip, Tooltip} from 'react-native-paper';
import {BottomSheetFlatList} from '@gorhom/bottom-sheet';

import {ModelTypeTag, Sheet} from '../../../../components';

import {urls} from '../../../../config';
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
  probeRemoteMTPCapability,
} from '../../../../utils';

interface DetailsViewProps {
  hfModel: HuggingFaceModel;
}

export const DetailsView = ({hfModel}: DetailsViewProps) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const isVision = isVisionRepo(hfModel.siblings || []);

  const llmFiles = getLLMFiles(hfModel.siblings || []);

  const [isMTP, setIsMTP] = useState(false);
  useEffect(() => {
    // A new model must not wear the previous model's badge while its own
    // probe is in flight.
    setIsMTP(false);
    const firstLLM = llmFiles[0];
    if (!firstLLM) {
      return;
    }
    let cancelled = false;
    const ggufUrl = urls.modelDownloadFile(hfModel.id, firstLLM.rfilename);
    // A probe that could not run stays silent rather than claiming a capability.
    probeRemoteMTPCapability(ggufUrl).then(capability => {
      if (!cancelled) {
        setIsMTP(capability === 'capable');
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hfModel.id]);

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
          {isMTP && (
            <Chip
              icon="rocket-launch-outline"
              compact
              style={styles.stat}
              textStyle={styles.statText}
              mode="outlined"
              testID="mtp-capability-badge">
              {l10n.models.modelCapabilities.mtp}
            </Chip>
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
