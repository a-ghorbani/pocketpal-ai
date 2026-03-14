import {Alert, Image, View} from 'react-native';
import React, {useContext, useState} from 'react';

import {observer} from 'mobx-react';
import {IconButton} from 'react-native-paper';

import iconHF from '../../assets/icon-hf.png';
import iconHFLight from '../../assets/icon-hf-light.png';

import {createStyles} from './styles';
import {ModelsResetDialog} from '../ModelsResetDialog';

import {modelStore, uiStore} from '../../store';

import {L10nContext} from '../../utils';
import {formatBytes} from '../../utils/formatters';

import {Menu} from '..';
import {
  clearModelShareCache,
  getModelShareCacheSizeBytes,
} from '../../utils/exportUtils';

export const ModelsHeaderRight = observer(() => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [resetDialogVisible, setResetDialogVisible] = useState(false);
  const [shareCacheSize, setShareCacheSize] = useState(0);
  const [_, setTrigger] = useState<boolean>(false);

  const l10n = useContext(L10nContext);

  const styles = createStyles();

  const filters = uiStore.pageStates.modelsScreen.filters;
  const setFilters = (value: string[]) => {
    uiStore.setValue('modelsScreen', 'filters', value);
  };

  const showResetDialog = () => setResetDialogVisible(true);
  const hideResetDialog = () => setResetDialogVisible(false);

  const handleReset = async () => {
    try {
      modelStore.resetModels();
      setTrigger(prev => !prev); // Trigger UI refresh
    } catch (error) {
      console.error('Error resetting models:', error);
    } finally {
      hideResetDialog();
    }
  };

  const toggleFilter = (filterName: string) => {
    const newFilters = filters.includes(filterName)
      ? filters.filter(f => f !== filterName)
      : [...filters, filterName];
    setFilters(newFilters);
  };

  const refreshShareCacheSize = async () => {
    try {
      const sizeBytes = await getModelShareCacheSizeBytes();
      setShareCacheSize(sizeBytes);
    } catch (error) {
      console.error('Failed to read model share cache size:', error);
      setShareCacheSize(0);
    }
  };

  const handleClearShareCache = async () => {
    setMenuVisible(false);
    Alert.alert(
      l10n.components.modelsHeaderRight.clearShareCacheTitle,
      l10n.components.modelsHeaderRight.clearShareCacheMessage,
      [
        {
          text: l10n.common.cancel,
          style: 'cancel',
        },
        {
          text: l10n.common.ok,
          onPress: async () => {
            try {
              const removedCount = await clearModelShareCache();
              await refreshShareCacheSize();
              Alert.alert(
                l10n.components.modelsHeaderRight.clearShareCacheDoneTitle,
                l10n.components.modelsHeaderRight.clearShareCacheDoneMessage.replace(
                  '{{count}}',
                  String(removedCount),
                ),
                [{text: l10n.common.ok}],
              );
            } catch (error) {
              console.error('Failed to clear model share cache:', error);
              Alert.alert(
                l10n.components.modelsHeaderRight.clearShareCacheErrorTitle,
                l10n.components.modelsHeaderRight.clearShareCacheErrorMessage,
                [{text: l10n.common.ok}],
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ModelsResetDialog
        visible={resetDialogVisible}
        onDismiss={hideResetDialog}
        onReset={handleReset}
        testID="reset-dialog"
      />
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        selectable
        anchor={
          <IconButton
            icon="tune-vertical"
            size={24}
            style={styles.iconButton}
            onPress={() => {
              refreshShareCacheSize().catch(error => {
                console.error(
                  'Failed to refresh model share cache size:',
                  error,
                );
              });
              setMenuVisible(true);
            }}
            testID="models-menu-button"
          />
        }
        anchorPosition="bottom">
        {/* Filter section */}
        <Menu.Item label="Filters" isGroupLabel />
        <Menu.Item
          icon={({size}) => (
            <Image
              source={filters.includes('hf') ? iconHF : iconHFLight}
              style={{width: size, height: size}}
            />
          )}
          onPress={() => toggleFilter('hf')}
          label={l10n.components.modelsHeaderRight.menuTitleHf}
          selected={filters.includes('hf')}
        />
        <Menu.Item
          icon={filters.includes('downloaded') ? 'download-circle' : 'download'}
          onPress={() => toggleFilter('downloaded')}
          label={l10n.components.modelsHeaderRight.menuTitleDownloaded}
          selected={filters.includes('downloaded')}
        />

        {/* View section */}
        <Menu.Item label="View" isGroupLabel />
        <Menu.Item
          icon={filters.includes('grouped') ? 'layers' : 'layers-outline'}
          onPress={() => toggleFilter('grouped')}
          label={l10n.components.modelsHeaderRight.menuTitleGrouped}
          selected={filters.includes('grouped')}
        />

        {/* Actions section */}
        <Menu.Separator />
        <Menu.Item
          leadingIcon="refresh"
          onPress={() => {
            setMenuVisible(false);
            showResetDialog();
          }}
          label={l10n.components.modelsHeaderRight.menuTitleReset}
        />
        <Menu.Item
          leadingIcon="broom"
          onPress={handleClearShareCache}
          label={`${l10n.components.modelsHeaderRight.menuTitleClearShareCache} (${formatBytes(
            shareCacheSize,
          )})`}
        />
      </Menu>
    </View>
  );
});
