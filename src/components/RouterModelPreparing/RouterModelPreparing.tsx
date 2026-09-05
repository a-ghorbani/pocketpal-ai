import React, {useContext} from 'react';
import {View} from 'react-native';
import {Button, ProgressBar, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {modelStore, serverStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

/**
 * Shown while a message is waiting for the server to make the bound model
 * ready. Rendered from the same operation the send gate waits on, so there is
 * one source of progress and not two.
 */
export const RouterModelPreparing: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const binding = modelStore.activeRemoteBinding;
  if (!binding) {
    return null;
  }
  const op = serverStore.routerOp(binding.serverId, binding.remoteModelId);
  // A withdrawn request is not work anyone is waiting on, whatever the store
  // keeps until a read confirms the row.
  if (op?.kind !== 'load' || op.cancelled) {
    return null;
  }

  // A load reports 0.0 on its first tick, so the bar is determinate at zero
  // rather than absent.
  const value = serverStore.routerLive(binding.serverId, binding.remoteModelId)
    ?.progress?.value;
  const determinate = typeof value === 'number' && value >= 0 && value <= 1;

  return (
    <View style={styles.container} testID="router-model-preparing">
      <View style={styles.row}>
        <Text variant="bodySmall" style={styles.label}>
          {l10n.chat.preparingModel}
        </Text>
        <Button
          compact
          mode="text"
          testID="router-model-preparing-cancel"
          onPress={() =>
            serverStore.cancelRouterOp(binding.serverId, binding.remoteModelId)
          }>
          {l10n.settings.routerModels.cancel}
        </Button>
      </View>
      <ProgressBar
        testID="router-model-preparing-progress"
        style={styles.progress}
        indeterminate={!determinate}
        progress={determinate ? value : undefined}
      />
    </View>
  );
});
