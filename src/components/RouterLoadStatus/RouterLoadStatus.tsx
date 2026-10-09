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
  | {remoteModelId: string; fraction: number | undefined}
  | undefined => {
  const binding = modelStore.activeRemoteBinding;
  const record = binding
    ? routerStore.recordFor(binding.serverId, binding.remoteModelId)
    : undefined;
  if (!binding || record?.kind !== 'load' || !routerStore.owns(record)) {
    return undefined;
  }
  return {
    remoteModelId: binding.remoteModelId,
    fraction: loadFraction(record.detail?.progress),
  };
};

export const RouterLoadStatus: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const load = boundRouterLoad();
  if (!load) {
    return null;
  }
  const {remoteModelId: model, fraction} = load;

  return (
    <View
      style={styles.container}
      testID="chat-router-loading"
      accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <ActivityIndicator size={14} color={theme.colors.onSurfaceVariant} />
        <Text
          variant="bodyMedium"
          style={styles.label}
          numberOfLines={1}
          ellipsizeMode="middle"
          testID="chat-router-loading-label">
          {fraction === undefined
            ? t(l10n.chat.routerLoading, {model})
            : t(l10n.chat.routerLoadingModel, {model})}
        </Text>
        {fraction !== undefined && (
          <Text
            variant="bodyMedium"
            style={styles.percent}
            testID="chat-router-loading-percent">
            {t(l10n.chat.routerLoadingPercent, {
              percent: Math.round(fraction * 100),
            })}
          </Text>
        )}
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
