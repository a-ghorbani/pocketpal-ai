import React, {useContext} from 'react';
import {Alert, TouchableOpacity, View} from 'react-native';
import {Button, ProgressBar, RadioButton, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {modelStore, routerStore, serverStore} from '../../store';
import type {RouterRecord} from '../../store';
import {L10nContext} from '../../utils';
import {routerFailureLabel} from '../../utils/routerCopy';
import type {RowState} from '../../api/llamaServer/routerWire';
import type {RemoteModelInfo} from '../../utils/types';
import {t} from '../../locales';

import {createStyles} from './styles';

type Group = 'loaded' | 'available';
type Action = 'load' | 'unload' | 'cancel';

interface RowPresentation {
  group: Group;
  label?: 'loading' | 'unloading' | 'loaded' | 'resident' | 'notLoaded';
  action?: Action;
  progress?: 'determinate' | 'indeterminate';
}

/**
 * An operation of this app presents its row while it runs; otherwise the
 * list does. A stale list claims nothing, and `sleeping` is never shown as
 * such.
 */
function presentRow(
  inFlight: RouterRecord['kind'] | undefined,
  row: RowState,
  determinate: boolean,
): RowPresentation {
  if (inFlight === 'load') {
    return {
      group: 'loaded',
      label: 'loading',
      action: 'cancel',
      progress: determinate ? 'determinate' : 'indeterminate',
    };
  }
  if (inFlight === 'unload') {
    return {group: 'loaded', label: 'unloading'};
  }
  switch (row) {
    case 'loaded':
      return {group: 'loaded', label: 'loaded', action: 'unload'};
    case 'sleeping':
      return {group: 'loaded', label: 'resident', action: 'unload'};
    case 'loading':
      return {group: 'loaded', label: 'loading', progress: 'indeterminate'};
    case 'unloaded':
    case 'failed':
      return {group: 'available', label: 'notLoaded', action: 'load'};
    case 'downloading':
      return {group: 'available'};
    default:
      return {group: 'available', action: 'load'};
  }
}

interface RouterModelRowsProps {
  serverId: string;
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
  isAlreadyAdded: (modelId: string) => boolean;
  renderVisionSlot: (model: RemoteModelInfo) => React.ReactNode;
}

export const RouterModelRows: React.FC<RouterModelRowsProps> = observer(
  ({serverId, selectedModelId, onSelect, isAlreadyAdded, renderVisionSlot}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const copy = l10n.settings.routerModels;
    const labels = {
      loading: copy.stateLoading,
      unloading: copy.unloading,
      loaded: copy.stateLoaded,
      resident: copy.stateResident,
      notLoaded: copy.stateUnloaded,
    };

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
      load: modelId => {
        routerStore.ensureLoaded(serverId, modelId).catch(() => {});
      },
      unload,
      cancel: modelId => routerStore.cancel(serverId, modelId),
    };
    const actionLabels: Record<Action, string> = {
      load: copy.load,
      unload: copy.unload,
      cancel: copy.cancel,
    };

    const presented = rows.map(model => {
      const record = routerStore.recordFor(serverId, model.id);
      const inFlight =
        record && routerStore.owns(record) ? record.kind : undefined;
      const value = record?.detail?.progress?.value;
      const determinate = typeof value === 'number' && value >= 0 && value <= 1;
      return {
        model,
        record,
        value: determinate ? value : undefined,
        presentation: presentRow(
          inFlight,
          routerStore.rowState(serverId, model.id),
          determinate,
        ),
      };
    });

    const renderRow = ({
      model,
      record,
      value,
      presentation,
    }: (typeof presented)[number]) => {
      const alreadyAdded = isAlreadyAdded(model.id);
      const selectable =
        !alreadyAdded &&
        routerStore.rowState(serverId, model.id) !== 'downloading';
      const select = () => {
        if (selectable) {
          onSelect(model.id);
        }
      };
      const {label, action, progress} = presentation;
      const failure = record?.failure;
      return (
        <View key={model.id} testID={`router-row-${model.id}`}>
          <View style={styles.modelRow}>
            <TouchableOpacity
              testID={`router-select-${model.id}`}
              activeOpacity={selectable ? 0.6 : 1}
              style={[
                styles.routerRowSelect,
                alreadyAdded && styles.modelRowDisabled,
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
              <Text style={styles.modelName}>{model.id}</Text>
              {alreadyAdded && (
                <Text style={styles.alreadyAddedText}>
                  {l10n.settings.alreadyAdded}
                </Text>
              )}
            </TouchableOpacity>
            <View style={styles.routerRowMeta}>
              {renderVisionSlot(model)}
              {label && (
                <Text
                  style={styles.routerRowState}
                  testID={`router-state-${model.id}`}>
                  {labels[label]}
                </Text>
              )}
              {action && (
                <Button
                  compact
                  mode="text"
                  testID={`router-${action}-${model.id}`}
                  onPress={() => actions[action](model.id)}>
                  {actionLabels[action]}
                </Button>
              )}
            </View>
          </View>
          {progress && (
            <ProgressBar
              testID={`router-progress-${model.id}`}
              style={styles.routerRowProgress}
              indeterminate={progress === 'indeterminate'}
              progress={value}
            />
          )}
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

    const groups: Array<[Group, string]> = [
      ['loaded', copy.loadedGroup],
      ['available', copy.availableGroup],
    ];

    return (
      <View style={styles.modelListSection}>
        {groups.map(([group, title]) => (
          <View key={group} testID={`router-group-${group}`}>
            <View style={styles.routerGroupHeader}>
              <Text style={styles.routerGroupTitle}>{title}</Text>
              {group === 'loaded' && (
                <Text
                  style={styles.routerGroupCount}
                  testID="router-resident-count">
                  {t(copy.residentCount, {
                    count: routerStore.residentCount(serverId),
                  })}
                </Text>
              )}
            </View>
            {presented
              .filter(entry => entry.presentation.group === group)
              .map(renderRow)}
          </View>
        ))}
        {routerStore.observedEviction.has(serverId) && (
          <View style={styles.routerNote} testID="router-eviction-note">
            <Text style={styles.routerNoteText}>{copy.evictionNote}</Text>
          </View>
        )}
      </View>
    );
  },
);
