import React, {useContext} from 'react';
import {Alert, TouchableOpacity, View} from 'react-native';
import {
  ActivityIndicator,
  Button,
  IconButton,
  RadioButton,
  Text,
} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {modelStore, routerStore, serverStore} from '../../store';
import type {RouterRecord} from '../../store';
import {L10nContext} from '../../utils';
import {routerFailureLabel} from '../../utils/routerCopy';
import {loadFraction} from '../../api/llamaServer/routerWire';
import type {RowState} from '../../api/llamaServer/routerWire';
import type {RemoteModelInfo} from '../../utils/types';
import {t} from '../../locales';
import {EyeIcon} from '../../assets/icons';

import {createStyles} from './styles';

type Status = 'loading' | 'unloading' | 'loaded';
type Action = 'unload' | 'cancel';

interface RowPresentation {
  status?: Status;
  action?: Action;
}

/**
 * An operation of this app presents its row while it runs; otherwise the
 * list does. A stale list claims nothing, and `sleeping` is never shown as
 * such.
 */
function presentRow(
  inFlight: RouterRecord['kind'] | undefined,
  row: RowState,
): RowPresentation {
  if (inFlight === 'load') {
    return {status: 'loading', action: 'cancel'};
  }
  if (inFlight === 'unload') {
    return {status: 'unloading'};
  }
  switch (row) {
    case 'loaded':
    case 'sleeping':
      return {status: 'loaded', action: 'unload'};
    case 'loading':
      return {status: 'loading'};
    default:
      return {};
  }
}

interface RouterModelRowsProps {
  serverId: string;
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
  isAlreadyAdded: (modelId: string) => boolean;
  supportsVision: (model: RemoteModelInfo) => boolean;
}

export const RouterModelRows: React.FC<RouterModelRowsProps> = observer(
  ({serverId, selectedModelId, onSelect, isAlreadyAdded, supportsVision}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const copy = l10n.settings.routerModels;

    const rows = serverStore.serverModels.get(serverId) ?? [];

    const unload = (modelId: string) => {
      const binding = modelStore.activeRemoteBinding;
      if (binding?.serverId !== serverId || binding.remoteModelId !== modelId) {
        routerStore.unload(serverId, modelId);
        return;
      }
      Alert.alert(copy.unloadBoundTitle, copy.unloadBoundBody, [
        {text: copy.cancel, style: 'cancel'},
        {
          text: copy.unloadBoundConfirm,
          style: 'destructive',
          onPress: () => routerStore.unload(serverId, modelId),
        },
      ]);
    };

    const actions: Record<Action, (modelId: string) => void> = {
      unload,
      cancel: modelId => routerStore.cancel(serverId, modelId),
    };
    const actionLabels: Record<Action, string> = {
      unload: copy.unloadModel,
      cancel: copy.cancelLoadingModel,
    };

    const renderStatus = (
      modelId: string,
      status: Status,
      fraction: number | undefined,
    ) => {
      if (status === 'loaded') {
        return (
          <View
            style={styles.routerDot}
            testID={`router-dot-${modelId}`}
            accessible
            accessibilityRole="image"
            accessibilityLabel={copy.stateLoaded}
          />
        );
      }
      const percent =
        fraction === undefined ? undefined : Math.round(fraction * 100);
      const label =
        status === 'unloading'
          ? copy.unloading
          : percent === undefined
            ? copy.stateLoading
            : t(copy.loadingPercent, {percent});
      return (
        <View
          style={styles.routerStatus}
          testID={`router-ring-${modelId}`}
          accessible
          accessibilityLabel={label}>
          <ActivityIndicator size={14} color={theme.colors.statusLoaded} />
          {percent !== undefined && (
            <Text
              style={styles.routerPercent}
              testID={`router-percent-${modelId}`}>
              {`${percent}%`}
            </Text>
          )}
        </View>
      );
    };

    const renderRow = (model: RemoteModelInfo) => {
      const record = routerStore.recordFor(serverId, model.id);
      const inFlight =
        record && routerStore.owns(record) ? record.kind : undefined;
      const rowState = routerStore.rowState(serverId, model.id);
      const {status, action} = presentRow(inFlight, rowState);
      const fraction =
        inFlight === 'load'
          ? loadFraction(record?.detail?.progress)
          : undefined;
      const alreadyAdded = isAlreadyAdded(model.id);
      const selectable = !alreadyAdded && rowState !== 'downloading';
      const select = () => {
        if (selectable) {
          onSelect(model.id);
        }
      };
      const failure = record?.failure;
      return (
        <View key={model.id} testID={`router-row-${model.id}`}>
          <View style={styles.routerRow}>
            <TouchableOpacity
              testID={`router-select-${model.id}`}
              activeOpacity={selectable ? 0.6 : 1}
              style={[
                styles.modelRow,
                styles.routerSelect,
                !selectable && styles.modelRowDisabled,
              ]}
              onPress={select}>
              <RadioButton
                value={model.id}
                status={
                  alreadyAdded || selectedModelId === model.id
                    ? 'checked'
                    : 'unchecked'
                }
                onPress={select}
                disabled={!selectable}
                uncheckedColor={theme.colors.onSurfaceVariant}
              />
              <Text
                style={styles.modelName}
                numberOfLines={1}
                ellipsizeMode="middle">
                {model.id}
              </Text>
              {supportsVision(model) && (
                <View
                  style={styles.routerVision}
                  testID={`router-vision-${model.id}`}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={l10n.models.modelCard.labels.vision}>
                  <EyeIcon
                    width={16}
                    height={16}
                    stroke={theme.colors.iconModelTypeVision}
                  />
                </View>
              )}
            </TouchableOpacity>
            {status && renderStatus(model.id, status, fraction)}
            {action && (
              <IconButton
                icon="power"
                size={20}
                style={styles.routerPower}
                iconColor={theme.colors.onSurfaceVariant}
                testID={`router-power-${model.id}`}
                accessibilityLabel={t(actionLabels[action], {
                  model: model.id,
                })}
                onPress={() => actions[action](model.id)}
              />
            )}
          </View>
          {failure && (
            <View style={styles.routerReasonRow}>
              <Text
                style={styles.routerReasonText}
                testID={`router-reason-${model.id}`}>
                {failure.message
                  ? `${routerFailureLabel(failure.cause, l10n)} ${failure.message}`
                  : routerFailureLabel(failure.cause, l10n)}
              </Text>
              <Button
                compact
                mode="text"
                testID={`router-dismiss-${model.id}`}
                onPress={() => routerStore.dismiss(serverId, model.id)}>
                {copy.dismiss}
              </Button>
            </View>
          )}
        </View>
      );
    };

    return (
      <View style={styles.modelListSection}>
        <Text style={styles.modelListLabel}>{l10n.settings.selectModel}</Text>
        {rows.map(renderRow)}
      </View>
    );
  },
);
