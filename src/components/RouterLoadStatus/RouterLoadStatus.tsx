import React, {useContext} from 'react';
import {View} from 'react-native';
import {ActivityIndicator, ProgressBar, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {t} from '../../locales';
import {modelStore, routerStore} from '../../store';
import {L10nContext} from '../../utils';
import {loadFraction} from '../../api/llamaServer/routerWire';

import {createStyles} from './styles';

/** This app's own load of the model the chat is bound to, while it runs. */
export const boundRouterLoad = ():
  | {fraction: number | undefined}
  | undefined => {
  const binding = modelStore.activeRemoteBinding;
  const record = binding
    ? routerStore.recordFor(binding.serverId, binding.remoteModelId)
    : undefined;
  if (!binding || record?.kind !== 'load' || !routerStore.owns(record)) {
    return undefined;
  }
  return {fraction: loadFraction(record.detail?.progress)};
};

export const RouterLoadStatus: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const load = boundRouterLoad();
  if (!load) {
    return null;
  }
  const {fraction} = load;

  return (
    <View style={styles.container} testID="chat-router-loading">
      <View
        style={styles.row}
        testID="chat-router-loading-status"
        accessible
        accessibilityLabel={l10n.chat.routerLoading}
        accessibilityLiveRegion="polite">
        <ActivityIndicator size={14} color={theme.colors.onSurfaceVariant} />
        <Text
          variant="bodyMedium"
          style={styles.label}
          numberOfLines={1}
          testID="chat-router-loading-label">
          {fraction === undefined
            ? l10n.chat.routerLoading
            : t(l10n.chat.routerLoadingPercent, {
                percent: Math.round(fraction * 100),
              })}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <ProgressBar
          testID="chat-router-loading-bar"
          style={styles.bar}
          color={theme.colors.onSurfaceVariant}
          indeterminate={fraction === undefined}
          progress={fraction}
        />
      </View>
    </View>
  );
});
