import React, {useContext} from 'react';
import {Button, Paragraph, ProgressBar, Text} from 'react-native-paper';
import {modelStore} from '../../store';
import {Model} from '../../utils/types';
import {useTheme} from '../../hooks';
import {View} from 'react-native';
import {createStyles} from './styles';
import {useNavigation} from '@react-navigation/native';
import {observer} from 'mobx-react';
import {formatBytes, L10nContext} from '../../utils';

export const ModelNotAvailable = observer(
  ({
    model,
    currentlySelectedModel,
    closeSheet,
  }: {
    model?: Model;
    currentlySelectedModel?: Model;
    closeSheet: () => void;
  }) => {
    const theme = useTheme();
    const navigation = useNavigation<any>();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const isPalModelDownloaded = modelStore.isModelAvailable(model?.id);
    const defaultModel = modelStore.models.find(m => m.id === model?.id);

    // Check if currently selected model is downloaded (if any)
    const isCurrentlySelectedModelDownloaded = currentlySelectedModel
      ? modelStore.isModelAvailable(currentlySelectedModel.id)
      : false;

    const isDownloading = defaultModel
      ? modelStore.isDownloading(defaultModel.id)
      : false;
    const downloadProgress = (defaultModel?.progress || 0) / 100;
    const downloadSpeed = defaultModel?.downloadSpeed;

    const hasAnyDownloadedModel = modelStore.availableModels.length > 0;

    const handleDownloadModel = async (modelToDownload: Model) => {
      if (modelToDownload.hfModel) {
        // For HF models, use default vision preference (enabled) for backward compatibility
        await modelStore.downloadHFModel(
          modelToDownload.hfModel!,
          modelToDownload.hfModelFile!,
          {enableVision: true},
        );
      } else {
        await modelStore.checkSpaceAndDownload(modelToDownload.id);
      }
    };

    const handleNavigateToModels = () => {
      closeSheet();
      navigation.navigate('Models');
    };

    if (!hasAnyDownloadedModel && !model) {
      return (
        <View style={styles.modelNotDownloaded}>
          <Text style={[theme.fonts.bodyMedium, styles.errorMessage]}>
            {l10n.components.modelNotAvailable.noModelsDownloaded}
          </Text>
          <Button onPress={handleNavigateToModels} mode="contained-tonal">
            {l10n.components.modelNotAvailable.downloadAModel}
          </Button>
        </View>
      );
    }
    // Show warning if:
    // 1. There's a default model that's not downloaded, AND
    // 2. Either no model is currently selected OR the currently selected model is not downloaded
    const shouldShowWarning =
      model &&
      !isPalModelDownloaded &&
      (!currentlySelectedModel || !isCurrentlySelectedModelDownloaded);

    if (shouldShowWarning) {
      return (
        <View style={styles.modelNotDownloaded}>
          {isDownloading ? (
            <>
              <ProgressBar
                testID="download-progress-bar"
                progress={downloadProgress}
                color={theme.colors.tertiary}
                style={styles.progressBar}
              />
              {downloadSpeed && <Paragraph>{downloadSpeed}</Paragraph>}
            </>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={[theme.fonts.bodyMedium, styles.errorMessage]}>
                {l10n.components.modelNotAvailable.defaultModelNotDownloaded}
              </Text>
              <View style={styles.recommendedModelContainer}>
                <Text style={[theme.fonts.labelSmall, styles.recommendedLabel]}>
                  {l10n.components.modelNotAvailable.recommendedModel}:
                </Text>
                <View style={styles.modelDetailsContainer}>
                  <Text style={[theme.fonts.bodySmall, styles.modelDetails]}>
                    {model.author && `${model.author}/`}
                    {model.filename}
                  </Text>
                  <Text style={[theme.fonts.bodySmall, styles.modelSize]}>
                    {formatBytes(model.size)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <Button
            onPress={() =>
              isDownloading
                ? modelStore.cancelDownload(model.id)
                : handleDownloadModel(model)
            }
            mode="contained-tonal">
            {isDownloading
              ? l10n.components.modelNotAvailable.cancelDownload
              : l10n.components.modelNotAvailable.download}
          </Button>
        </View>
      );
    }
    return null;
  },
);
