import React, {useContext} from 'react';
import {Text, View} from 'react-native';
import {Button} from 'react-native-paper';
import {observer} from 'mobx-react';

import {Sheet} from '../Sheet';
import {DownloadProgressCard} from '../DownloadProgressCard';
import {useTheme} from '../../hooks';
import {modelStore, palStore} from '../../store';
import {L10nContext} from '../../utils';
import {sheetStyles as createStyles} from './styles';

const formatSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) {
    return '';
  }
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
};

type DownloadSheetProps = {
  isVisible: boolean;
  onClose: () => void;
};

/**
 * Bottom sheet listing every in-flight download with a Cancel button per row.
 * Sourced from `modelStore.activeDownloads`; auto-closes when the list empties.
 */
export const DownloadSheet: React.FC<DownloadSheetProps> = observer(
  ({isVisible, onClose}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const downloads = modelStore.activeDownloads;

    React.useEffect(() => {
      if (isVisible && downloads.length === 0) {
        onClose();
      }
    }, [isVisible, downloads.length, onClose]);

    return (
      <Sheet
        title="Downloads"
        isVisible={isVisible}
        onClose={onClose}
        snapPoints={['50%']}>
        <Sheet.ScrollView contentContainerStyle={styles.container}>
          {downloads.map(entry => {
            const pal = palStore.pals.find(
              p =>
                p.source === 'local' &&
                p.defaultModel &&
                p.defaultModel.id === entry.modelId,
            );
            const displayName = pal ? pal.name : entry.model.name;
            const sizeLabel = formatSize(entry.bytesTotal);
            const bytesLabel = [entry.speedLabel].filter(Boolean).join(' ');
            return (
              <View key={entry.modelId} style={styles.row}>
                <Text style={styles.rowTitle}>{displayName}</Text>
                <DownloadProgressCard
                  modelName={entry.model.name}
                  sizeLabel={sizeLabel}
                  progress={entry.progress}
                  bytesLabel={bytesLabel}
                  etaLabel={entry.etaLabel}
                />
                <Button
                  testID={`download-sheet-cancel-${entry.modelId}`}
                  mode="outlined"
                  onPress={() => modelStore.cancelDownload(entry.modelId)}
                  style={styles.cancel}>
                  {l10n.common.cancel}
                </Button>
              </View>
            );
          })}
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);
