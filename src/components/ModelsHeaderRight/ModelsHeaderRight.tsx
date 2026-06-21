import {Text, View} from 'react-native';
import React, {useContext, useState} from 'react';

import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {ModelsResetDialog} from '../ModelsResetDialog';

import {Button, IconButton} from '../ui';
import {DotsVerticalIcon, PlusIcon} from '../../assets/icons';

import {modelStore, uiStore} from '../../store';

import {L10nContext} from '../../utils';

import {Menu} from '..';

interface ModelsHeaderRightProps {
  onAddModel?: () => void;
}

export const ModelsHeaderRight = observer(
  ({onAddModel}: ModelsHeaderRightProps) => {
    const [menuVisible, setMenuVisible] = useState(false);
    const [resetDialogVisible, setResetDialogVisible] = useState(false);
    const [_, setTrigger] = useState<boolean>(false);

    const l10n = useContext(L10nContext);

    const theme = useTheme();
    const styles = createStyles(theme);

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
        <Button
          variant="tertiary"
          size="s"
          accessibilityLabel={l10n.models.labels.addAModel}
          onPress={onAddModel}
          testID="models-add-model-button">
          <View style={styles.addModel}>
            <PlusIcon width={18} height={18} stroke={theme.colors.onSurface} />
            <Text style={styles.addModelLabel}>
              {l10n.models.labels.addAModel}
            </Text>
          </View>
        </Button>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          selectable
          anchor={
            <IconButton
              icon={
                <DotsVerticalIcon
                  width={20}
                  height={20}
                  stroke={theme.colors.onSurface}
                />
              }
              accessibilityLabel={
                l10n.components.modelsHeaderRight.menuTitleGrouped
              }
              style={styles.iconButton}
              onPress={() => setMenuVisible(true)}
              testID="models-menu-button"
            />
          }
          anchorPosition="bottom">
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
  },
);
