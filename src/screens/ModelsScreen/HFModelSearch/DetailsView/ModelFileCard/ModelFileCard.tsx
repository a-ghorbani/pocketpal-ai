import React, {FC} from 'react';
import {Alert, View} from 'react-native';

import {computed} from 'mobx';
import {observer} from 'mobx-react';
import {IconButton, Text, Tooltip} from 'react-native-paper';

import {useTheme} from '../../../../../hooks';

import {createStyles} from './styles';

import {modelStore} from '../../../../../store';

import {formatBytes, hfAsModel} from '../../../../../utils';
import {
  HuggingFaceModel,
  Model,
  ModelFile,
  ModelOrigin,
} from '../../../../../utils/types';

interface ModelFileCardProps {
  modelFile: ModelFile;
  hfModel: HuggingFaceModel;
}

export const ModelFileCard: FC<ModelFileCardProps> = observer(
  ({modelFile, hfModel}) => {
    const theme = useTheme();
    const styles = createStyles(theme);

    // Find the model in the store if exitst
    const modelId = hfAsModel(hfModel, modelFile).id;
    const storeModel = modelStore.models.find(m => m.id === modelId);

    const isDownloading = storeModel
      ? modelStore.isDownloading(storeModel.id)
      : false;
    const downloadProgress = storeModel?.progress || 0;
    const downloadSpeed = storeModel?.downloadSpeed;

    const isBookmarked = computed(() =>
      modelStore.models.some(
        model =>
          model.origin === ModelOrigin.HF &&
          model.hfModelFile?.oid === modelFile.oid,
      ),
    ).get();

    const isDownloaded = computed(() =>
      modelStore.models.some(
        model =>
          model.origin === ModelOrigin.HF &&
          model.hfModelFile?.oid === modelFile.oid &&
          model.isDownloaded,
      ),
    ).get();

    const handleBookmark = () => {
      if (!isBookmarked) {
        modelStore.addHFModel(hfModel, modelFile);
      }
    };

    const handleUnbookmark = () => {
      if (isBookmarked) {
        const model = modelStore.models.find(
          (m: Model) => m.hfModelFile?.oid === modelFile.oid,
        );
        if (model && model.isDownloaded) {
          Alert.alert(
            'Cannot Remove',
            'The model is downloaded. Please delete the file first.',
          );
        } else if (model) {
          Alert.alert(
            'Remove Model',
            'Are you sure you want to remove this model from the list?',
            [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Remove',
                onPress: () => {
                  const removed = modelStore.removeModelFromList(model);
                  if (!removed) {
                    Alert.alert('Error', 'Failed to remove the model.');
                  }
                },
              },
            ],
          );
        }
      }
    };

    const toggleBookmark = () => {
      if (isBookmarked) {
        handleUnbookmark();
      } else {
        handleBookmark();
      }
    };

    const handleDownload = () => {
      if (isDownloaded) {
        Alert.alert(
          'Model Already Downloaded',
          'The model is already downloaded.',
        );
      } else {
        modelStore.downloadHFModel(hfModel, modelFile);
      }
    };

    const handleCancel = () => {
      if (storeModel && isDownloading) {
        modelStore.cancelDownload(storeModel.id);
      }
    };

    const handleDelete = () => {
      const model = modelStore.models.find(
        m => m.hfModelFile?.oid === modelFile.oid,
      );
      if (model && model.isDownloaded) {
        Alert.alert(
          'Delete Model',
          'Are you sure you want to delete this downloaded model?',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Delete',
              onPress: async () => {
                await modelStore.deleteModel(model);
              },
            },
          ],
        );
      }
    };

    const downloadIcon = isDownloaded
      ? 'delete'
      : modelFile.canFitInStorage
      ? 'download-outline'
      : 'download-off-outline';

    return (
      <View style={styles.fileCard}>
        <View style={styles.fileContent}>
          <View style={styles.fileInfo}>
            <Tooltip title={modelFile.rfilename}>
              <Text
                numberOfLines={1}
                ellipsizeMode="head"
                style={styles.fileName}>
                {modelFile.rfilename}
              </Text>
            </Tooltip>
            {modelFile.size && (
              <Text style={styles.fileSize}>
                {formatBytes(modelFile.size, 2, false, true)}
              </Text>
            )}
          </View>
          <View style={styles.fileActions}>
            <IconButton
              icon={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              onPress={toggleBookmark}
              size={20}
            />
            <Tooltip
              title={
                !modelFile.canFitInStorage
                  ? 'Not enough storage space available'
                  : ''
              }>
              <View>
                <IconButton
                  icon={downloadIcon}
                  onPress={
                    isDownloaded
                      ? handleDelete
                      : isDownloading
                      ? handleCancel
                      : handleDownload
                  }
                  size={20}
                  disabled={!isDownloaded && !modelFile.canFitInStorage}
                />
              </View>
            </Tooltip>
          </View>
        </View>
      </View>
    );
  },
);
