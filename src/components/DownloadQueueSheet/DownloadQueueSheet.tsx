import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity, ScrollView} from 'react-native';
import {observer} from 'mobx-react';
import {useTheme, IconButton, Button} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {
  downloadQueueManager,
  DownloadQueueItem,
  QueueItemStatus,
} from '../../services/downloads/DownloadQueueManager';
import {formatBytes} from '../../utils/formatters';

import {createStyles} from './styles';

const STATUS_ICONS: Record<QueueItemStatus, string> = {
  queued: 'clock-outline',
  downloading: 'download',
  paused: 'pause-circle-outline',
  completed: 'check-circle-outline',
  failed: 'alert-circle-outline',
  cancelled: 'cancel',
};

const STATUS_LABELS: Record<QueueItemStatus, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const DownloadQueueSheet = observer(() => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const queue = downloadQueueManager.getQueue();
  const activeItems = queue.filter(
    item => item.status === 'downloading' || item.status === 'queued',
  );
  const failedCount = downloadQueueManager.failedItems.length;
  const completedCount = downloadQueueManager.completedItems.length;

  if (queue.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Icon name="download-off" size={48} color={theme.colors.outline} />
        <Text style={styles.emptyText}>No downloads in queue</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Download Queue</Text>
      </View>

      <Text style={styles.summary}>
        {activeItems.length} active · {completedCount} completed ·{' '}
        {failedCount} failed
      </Text>

      <View style={styles.actionsRow}>
        {failedCount > 0 && (
          <Button
            mode="outlined"
            compact
            onPress={() => downloadQueueManager.retryFailed()}
            icon="refresh">
            Retry failed
          </Button>
        )}
        <Button
          mode="outlined"
          compact
          onPress={() => downloadQueueManager.clearCompleted()}
          icon="broom">
          Clear completed
        </Button>
      </View>

      {queue.map(item => (
        <DownloadQueueItemRow key={item.id} item={item} styles={styles} />
      ))}
    </ScrollView>
  );
});

interface ItemRowProps {
  item: DownloadQueueItem;
  styles: ReturnType<typeof createStyles>;
}

const DownloadQueueItemRow = observer(({item, styles}: ItemRowProps) => {
  const theme = useTheme();

  const progress = item.progress?.progress || 0;
  const downloadedBytes = item.progress?.downloadedBytes || 0;
  const totalBytes = item.progress?.totalBytes || 0;

  const handlePause = () => downloadQueueManager.pauseDownload(item.id);
  const handleResume = () => downloadQueueManager.resumeDownload(item.id);
  const handleCancel = () => downloadQueueManager.cancelDownload(item.id);
  const handleRemove = () => downloadQueueManager.removeFromQueue(item.id);

  return (
    <View style={styles.item}>
      <View style={styles.itemIcon}>
        <Icon
          name={STATUS_ICONS[item.status]}
          size={24}
          color={
            item.status === 'failed'
              ? theme.colors.error
              : item.status === 'completed'
                ? theme.colors.primary
                : theme.colors.onSurfaceVariant
          }
        />
      </View>

      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.model.name || item.model.id}
        </Text>
        <Text style={styles.itemStatus}>
          {STATUS_LABELS[item.status]}
          {item.status === 'downloading' && totalBytes > 0 && (
            <> · {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}</>
          )}
          {item.status === 'downloading' && ` · ${Math.round(progress * 100)}%`}
        </Text>

        {(item.status === 'downloading' || item.status === 'queued') && (
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {width: `${Math.round(progress * 100)}%`},
              ]}
            />
          </View>
        )}

        {item.error && (
          <Text style={styles.errorText} numberOfLines={2}>
            {item.error}
          </Text>
        )}
      </View>

      <View style={styles.itemActions}>
        {item.status === 'downloading' && (
          <IconButton
            icon="pause"
            size={20}
            onPress={handlePause}
            style={styles.iconButton}
          />
        )}
        {(item.status === 'paused' || item.status === 'failed') && (
          <IconButton
            icon="play"
            size={20}
            onPress={handleResume}
            style={styles.iconButton}
          />
        )}
        {(item.status === 'downloading' ||
          item.status === 'queued' ||
          item.status === 'paused') && (
          <IconButton
            icon="close"
            size={20}
            onPress={handleCancel}
            style={styles.iconButton}
          />
        )}
        {(item.status === 'completed' ||
          item.status === 'failed' ||
          item.status === 'cancelled') && (
          <IconButton
            icon="delete-outline"
            size={20}
            onPress={handleRemove}
            style={styles.iconButton}
          />
        )}
      </View>
    </View>
  );
});
