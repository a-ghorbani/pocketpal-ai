import React, {useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {observer} from 'mobx-react';
import {reaction} from 'mobx';

import {modelStore, uiStore} from '../../store';
import {DownloadBanner} from './DownloadBanner';
import {DownloadSheet} from './DownloadSheet';
import {overlayStyles as createStyles} from './styles';
import {useTheme} from '../../hooks';

/**
 * Mounts the DownloadBanner over the navigator and the DownloadSheet
 * underneath. Persists across navigation because it's rendered above the
 * App-level SwitchPoint. The banner self-hides when there's no
 * non-dismissed active download; the sheet auto-closes when the
 * download list empties.
 */
export const DownloadOverlay: React.FC = observer(() => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = createStyles(theme, insets.top);
  const [sheetVisible, setSheetVisible] = useState(false);
  const previousIds = useRef<Set<string>>(new Set());

  // Clear the per-download dismissal when a download disappears (completed
  // or cancelled) so the next ready-to-load surface isn't pre-suppressed.
  useEffect(() => {
    return reaction(
      () => modelStore.activeDownloads.map(d => d.modelId),
      ids => {
        const current = new Set(ids);
        previousIds.current.forEach(id => {
          if (!current.has(id)) {
            uiStore.clearDownloadBannerDismissal(id);
          }
        });
        previousIds.current = current;
      },
      {fireImmediately: true},
    );
  }, []);

  return (
    <>
      <View pointerEvents="box-none" style={styles.root}>
        <DownloadBanner onPress={() => setSheetVisible(true)} />
      </View>
      <DownloadSheet
        isVisible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
    </>
  );
});
