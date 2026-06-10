import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {observer} from 'mobx-react';
import {useNavigation, NavigationProp} from '@react-navigation/native';

import {XIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {modelStore, palStore, uiStore} from '../../store';
import {ROUTES} from '../../utils/navigationConstants';
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

/**
 * Sticky single-row banner showing the first non-dismissed active download.
 *
 * Affordances:
 *   - Body tap → Models screen (the home for multi-download management;
 *     the +N badge telegraphs that there are more behind the visible one).
 *   - Stop pill → cancels the visible download. Pal stays bound to the
 *     model so the user can resume from the Models screen.
 *   - × icon  → dismisses the banner for this download only. Download
 *     continues. Dismissal clears when the download disappears.
 */
export const DownloadBanner: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<NavigationProp<any>>();

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
  const extraCount = Math.max(0, modelStore.activeDownloads.length - 1);

  return (
    <View style={styles.root}>
      <Pressable
        testID="download-banner"
        accessibilityRole="button"
        accessibilityLabel={
          extraCount > 0
            ? `${title}, ${eta}, +${extraCount} more in progress`
            : `${title}, ${eta}`
        }
        onPress={() => navigation.navigate(ROUTES.MODELS as never)}
        style={styles.body}>
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
            {extraCount > 0 ? (
              <View testID="download-banner-extra-badge" style={styles.badge}>
                <Text style={styles.badgeText}>{`+${extraCount}`}</Text>
              </View>
            ) : null}
            {eta ? <Text style={styles.eta}>{eta}</Text> : null}
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, {width: `${clamped}%`}]} />
          </View>
        </View>
      </Pressable>
      <Pressable
        testID="download-banner-stop"
        accessibilityRole="button"
        accessibilityLabel="Stop"
        onPress={() => modelStore.cancelDownload(visible.modelId)}
        style={styles.stop}
        hitSlop={8}>
        <Text style={styles.stopText}>Stop</Text>
      </Pressable>
      <Pressable
        testID="download-banner-dismiss"
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={() => uiStore.dismissDownloadBanner(visible.modelId)}
        style={styles.dismiss}
        hitSlop={8}>
        <XIcon width={14} height={14} stroke={theme.colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
});
