import {Image, View} from 'react-native';
import React, {useContext, useState} from 'react';

import {observer} from 'mobx-react';
import {IconButton} from 'react-native-paper';

import iconHF from '../../assets/icon-hf.png';
import iconHFLight from '../../assets/icon-hf-light.png';

import {createStyles} from './styles';
import {ModelsResetDialog} from '../ModelsResetDialog';

import {modelStore, uiStore} from '../../store';

import {L10nContext} from '../../utils';

import {Menu} from '..';

export const ModelsHeaderRight = observer(() => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [resetDialogVisible, setResetDialogVisible] = useState(false);
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
      await modelStore.resetModels();
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
            onPress={() => setMenuVisible(true)}
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
      </Menu>
    </View>
  );
});
