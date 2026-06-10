import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {XIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {modelStore, palStore, uiStore} from '../../store';
import {bannerStyles as createStyles} from './styles';

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

type DownloadBannerProps = {
  onPress: () => void;
};

/**
 * Sticky single-row banner showing the first non-dismissed active download.
 * Tap opens the full DownloadSheet. The × dismisses *this* download —
 * silenced until the download completes or a new one starts.
 */
export const DownloadBanner: React.FC<DownloadBannerProps> = observer(
  ({onPress}) => {
    const theme = useTheme();
    const styles = createStyles(theme);

    const visible = modelStore.activeDownloads.find(
      d => !uiStore.isDownloadBannerDismissed(d.modelId),
    );
    if (!visible) {
      return null;
    }

    // Match the download's model id to a local pal so we can show the pal
    // name (the user's mental model is "Pip is downloading", not the
    // filename). Falls back to the model name when no pal owns it (manual
    // download from Models screen).
    const pal = palStore.pals.find(
      p =>
        p.source === 'local' &&
        p.defaultModel &&
        p.defaultModel.id === visible.modelId,
    );
    const title = pal
      ? `${pal.name} is downloading`
      : `${visible.model.name} is downloading`;
    const eta = visible.etaLabel || formatSize(visible.bytesTotal);
    const clamped = Math.max(0, Math.min(100, visible.progress));

    return (
      <Pressable
        testID="download-banner"
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${eta}`}
        onPress={onPress}
        style={styles.root}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.avatar,
            pal?.color?.[0] ? {backgroundColor: pal.color[0]} : null,
          ]}
        />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
            {eta ? <Text style={styles.eta}>{eta}</Text> : null}
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, {width: `${clamped}%`}]} />
          </View>
        </View>
        <Pressable
          testID="download-banner-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => uiStore.dismissDownloadBanner(visible.modelId)}
          style={styles.dismiss}
          hitSlop={8}>
          <XIcon width={16} height={16} stroke={theme.colors.onSurfaceVariant} />
        </Pressable>
      </Pressable>
    );
  },
);
