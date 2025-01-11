import React, {FC, useState} from 'react';
import {Alert, View, StyleSheet, Pressable} from 'react-native';
import {computed} from 'mobx';
import {observer} from 'mobx-react';
import LinearGradient from 'react-native-linear-gradient';
import {IconButton, Text, Tooltip, Snackbar, Portal} from 'react-native-paper';

import {useTheme, useMemoryCheck} from '../../../../../hooks';
import {createStyles} from './styles';
import {modelStore} from '../../../../../store';
import {formatBytes, hfAsModel} from '../../../../../utils';
import {isLegacyQuantization} from '../../../../../utils/modelSettings';
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

type Warning = {
  type: string;
  icon: string;
  message: string;
  shortMessage: string;
};

export const ModelFileCard: FC<ModelFileCardProps> = observer(
  ({modelFile, hfModel}) => {
    const [showWarning, setShowWarning] = useState(false);
    const theme = useTheme();
    const styles = createStyles(theme);
    const HF_YELLOW = '#FFD21E';

    // Check if we have all the necessary data, as some are fetched async, like size.
    const isModelInfoReady = Boolean(
      modelFile.size !== undefined && modelFile.canFitInStorage !== undefined,
    );

    // Find the model in the store if exitst
    const modelId = hfAsModel(hfModel, modelFile).id;
    const storeModel = modelStore.models.find(m => m.id === modelId);

    const isDownloading = storeModel
      ? modelStore.isDownloading(storeModel.id)
      : false;
    const downloadProgress = storeModel?.progress || 0;
    const downloadSpeed = storeModel?.downloadSpeed;

    const isBookmarked = computed(() =>
      modelStore.models.some(model => model.hfModelFile?.oid === modelFile.oid),
    ).get();

    const isDownloaded = computed(() =>
      modelStore.models.some(
        model => model.hfModelFile?.oid === modelFile.oid && model.isDownloaded,
      ),
    ).get();

    const {shortMemoryWarning} = useMemoryCheck(hfAsModel(hfModel, modelFile));

    const warnings = [
      !modelFile.canFitInStorage && {
        type: 'storage',
        icon: 'zip-disk',
        message: 'Not enough storage space available.',
        shortMessage: 'Low Storage',
      },
      shortMemoryWarning && {
        type: 'memory',
        icon: 'memory',
        message:
          "Model size is close to or exceeds your device's total memory. This may cause unexpected behavior.",
        shortMessage: shortMemoryWarning,
      },
      isLegacyQuantization(modelFile.rfilename) && {
        type: 'legacy',
        icon: 'alert-circle-outline',
        message: 'Legacy quantization format - model may not run.',
        shortMessage: 'Legacy quantization',
      },
    ].filter((w): w is Warning => Boolean(w));

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
        if (model?.origin === ModelOrigin.PRESET) {
          Alert.alert('Cannot Remove', 'The model is preset.');
        } else if (model?.isDownloaded) {
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
      if (model?.isDownloaded) {
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

    const handleWarningPress = () => {
      setShowWarning(true);
    };

    const handleDismissWarning = () => {
      setShowWarning(false);
    };

    return (
      <View style={styles.fileCardContainer}>
        <LinearGradient
          colors={[theme.dark ? HF_YELLOW + '90' : HF_YELLOW, 'transparent']}
          locations={[1, 1]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={[
            StyleSheet.absoluteFill,
            {width: `${downloadProgress}%`},
            styles.gradientBackground,
          ]}
        />
        <View style={styles.fileContent}>
          <View style={styles.header}>
            <View style={styles.fileInfo}>
              <Text
                variant="titleSmall"
                numberOfLines={1}
                ellipsizeMode="middle"
                style={styles.fileName}>
                {modelFile.rfilename}
              </Text>
              <View style={styles.metadataRow}>
                {isModelInfoReady && modelFile.size && (
                  <Text variant="labelSmall" style={styles.fileSize}>
                    {formatBytes(modelFile.size, 2, false, true)}
                  </Text>
                )}
                {isModelInfoReady && warnings.length > 0 && (
                  <Pressable onPress={handleWarningPress}>
                    <View style={styles.warningChip}>
                      <IconButton
                        icon={warnings[0].icon}
                        iconColor={theme.colors.onErrorContainer}
                        size={12}
                        style={styles.warningIcon}
                      />
                      <Text style={styles.warningText}>
                        {warnings.length > 1
                          ? `${warnings.length} Warnings`
                          : warnings[0].shortMessage}
                      </Text>
                    </View>
                  </Pressable>
                )}
              </View>

              {/* Download Speed */}
              {isDownloading && downloadSpeed && (
                <Text variant="bodySmall" style={styles.downloadSpeed}>
                  {downloadSpeed}
                </Text>
              )}
            </View>
            <View style={styles.fileActions}>
              <IconButton
                testID="bookmark-button"
                icon={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                onPress={toggleBookmark}
                size={20}
                animated
              />
              {isDownloading ? (
                <IconButton
                  testID="cancel-button"
                  icon="close"
                  onPress={handleCancel}
                  size={20}
                  animated
                />
              ) : (
                <Tooltip
                  enterTouchDelay={50}
                  title={
                    isModelInfoReady && !modelFile.canFitInStorage
                      ? 'Not enough storage space available'
                      : ''
                  }>
                  <View>
                    <IconButton
                      testID="download-button"
                      icon={downloadIcon}
                      onPress={
                        isDownloaded
                          ? handleDelete
                          : isDownloading
                          ? handleCancel
                          : handleDownload
                      }
                      size={20}
                      animated
                      disabled={
                        !isModelInfoReady ||
                        (!isDownloaded && !modelFile.canFitInStorage)
                      }
                    />
                  </View>
                </Tooltip>
              )}
            </View>
          </View>
        </View>
        <Portal>
          <Snackbar
            visible={showWarning}
            onDismiss={handleDismissWarning}
            duration={1000 + 2000 * warnings.length}
            style={styles.snackbarContainer}
            action={{
              label: 'Dismiss',
              onPress: handleDismissWarning,
              labelStyle: {color: theme.colors.inverseSecondary},
            }}>
            <View style={styles.snackbarContent}>
              {warnings.map((warning, index) => (
                <Text key={warning.type} style={styles.snackbarText}>
                  {warnings.length > 1
                    ? `${index + 1}. ${warning.message}`
                    : warning.message}
                </Text>
              ))}
            </View>
          </Snackbar>
        </Portal>
      </View>
    );
  },
);
