import React, {useContext} from 'react';
import {View} from 'react-native';
import {Button, ProgressBar, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {modelStore, routerStore} from '../../store';
import {L10nContext} from '../../utils';
import {routerFailureLabel} from '../../utils/routerCopy';

import {createStyles} from './styles';

/**
 * The router load of the model this chat is bound to: its progress and
 * Cancel while it runs, its reason once it failed. Cancel ends the load;
 * Stop on the composer only releases the waiting message.
 */
export const RouterModelPreparing: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const binding = modelStore.activeRemoteBinding;
  const record = binding
    ? routerStore.recordFor(binding.serverId, binding.remoteModelId)
    : undefined;
  if (!binding || record?.kind !== 'load') {
    return null;
  }
  const {serverId, remoteModelId} = binding;

  if (record.failure) {
    const label = routerFailureLabel(record.failure.cause, l10n);
    return (
      <View style={styles.container} testID="router-model-preparing">
        <View style={styles.row}>
          <Text
            variant="bodySmall"
            style={styles.reason}
            testID="router-model-preparing-reason">
            {record.failure.message
              ? `${label} ${record.failure.message}`
              : label}
          </Text>
          <Button
            compact
            mode="text"
            testID="router-model-preparing-dismiss"
            onPress={() => routerStore.dismiss(serverId, remoteModelId)}>
            {l10n.settings.routerModels.dismiss}
          </Button>
        </View>
      </View>
    );
  }
  if (!routerStore.owns(record)) {
    return null;
  }

  const value = record.detail?.progress?.value;
  const determinate = typeof value === 'number' && value >= 0 && value <= 1;

  return (
    <View style={styles.container} testID="router-model-preparing">
      <View style={styles.row}>
        <Text
          variant="bodySmall"
          style={styles.label}
          testID="router-model-preparing-label">
          {record.droppedTurn
            ? l10n.chat.preparingDroppedTurn
            : l10n.chat.preparingModel}
        </Text>
        <Button
          compact
          mode="text"
          testID="router-model-preparing-cancel"
          onPress={() => routerStore.cancel(serverId, remoteModelId)}>
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
