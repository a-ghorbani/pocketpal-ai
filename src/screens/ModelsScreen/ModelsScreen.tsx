import React, {useContext, useState} from 'react';
import {FlatList, RefreshControl, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {Portal} from 'react-native-paper';

import {useTheme} from '../../hooks';

import {ModelCard} from './ModelCard';
import {createStyles} from './styles';
import {
  DownloadErrorDialog,
  ErrorSnackbar,
  ModelSettingsSheet,
  ModelErrorReportSheet,
} from '../../components';

import {modelStore, uiStore} from '../../store';

import {L10nContext} from '../../utils';
import {Model} from '../../utils/types';
import {ErrorState} from '../../utils/errors';

export const ModelsScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model | undefined>();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const [isErrorReportVisible, setIsErrorReportVisible] = useState(false);
  const [errorToReport, setErrorToReport] = useState<ErrorState | null>(null);

  const theme = useTheme();
  const styles = createStyles(theme);

  const downloadError = modelStore.downloadError;
  const modelLoadError = modelStore.modelLoadError;
  const hasDialogError = !!downloadError?.metadata?.modelId;
  const activeError = hasDialogError
    ? null
    : modelLoadError || downloadError || null;

  const onRefresh = async () => {
    setRefreshing(true);
    await modelStore.refreshDownloadStatuses();
    setRefreshing(false);
  };

  const handleOpenSettings = (model: Model) => {
    setSelectedModel(model);
    setSettingsVisible(true);
  };

  const handleCloseSettings = () => {
    setSettingsVisible(false);
    setSelectedModel(undefined);
  };

  const handleDismissError = () => {
    modelStore.clearDownloadError();
    modelStore.clearModelLoadError();
  };

  const handleRetryAction = () => {
    if (activeError?.context === 'download') {
      modelStore.retryDownload();
    } else if (activeError?.context === 'modelInit') {
      const modelId = activeError.metadata?.modelId;
      if (modelId) {
        const model = modelStore.models.find(m => m.id === modelId);
        if (model) {
          modelStore.initContext(model);
        }
      }
    }
    handleDismissError();
  };

  const handleReportModelError = () => {
    if (activeError?.context === 'modelInit') {
      setErrorToReport(activeError);
      setIsErrorReportVisible(true);
      handleDismissError();
    }
  };

  const handleCloseErrorReport = () => {
    setIsErrorReportVisible(false);
    setErrorToReport(null);
  };

  const renderModelItem = ({item}: {item: Model}) => (
    <ModelCard
      model={item}
      activeModelId={modelStore.activeModelId ?? undefined}
      onOpenSettings={() => handleOpenSettings(item)}
    />
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={modelStore.displayModels}
        keyExtractor={item => item.id}
        renderItem={renderModelItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {modelStore.models[0] ? (
              <ModelCard
                model={modelStore.models[0]}
                activeModelId={modelStore.activeModelId ?? undefined}
                onOpenSettings={() =>
                  modelStore.models[0] &&
                  handleOpenSettings(modelStore.models[0])
                }
              />
            ) : null}
          </View>
        }
      />

      {activeError && (
        <ErrorSnackbar
          error={activeError}
          onDismiss={handleDismissError}
          onRetry={handleRetryAction}
          onReport={handleReportModelError}
        />
      )}

      <DownloadErrorDialog
        isVisible={hasDialogError}
        error={downloadError || null}
        onDismiss={handleDismissError}
        onRetry={handleRetryAction}
      />

      <ModelErrorReportSheet
        isVisible={isErrorReportVisible}
        onClose={handleCloseErrorReport}
        error={errorToReport}
      />

      <Portal>
        {selectedModel && (
          <ModelSettingsSheet
            model={selectedModel}
            isVisible={settingsVisible}
            onClose={handleCloseSettings}
            onShowSnackbar={message => uiStore.setChatWarning(message)}
            title={l10n.models.modelSettings.title}
          />
        )}
      </Portal>
    </View>
  );
});
