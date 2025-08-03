import {View, Keyboard, Alert} from 'react-native';

import React, {useContext, useState} from 'react';

import {observer} from 'mobx-react';
import {IconButton, useTheme} from 'react-native-paper';

import {createStyles} from './styles';
import {L10nContext} from '../../utils';

import {Menu} from '..';
import {DotsVerticalIcon, ShareIcon} from '../../assets/icons';

import {exportAllPals} from '../../utils/exportUtils';
import {importPals} from '../../utils/importUtils';

export const PalHeaderRight = observer(() => {
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);

  const l10n = useContext(L10nContext);

  const styles = createStyles();

  const openMenu = () => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
    }
    setMenuVisible(true);
  };
  const closeMenu = () => setMenuVisible(false);

  const onPressExportAllPals = async () => {
    try {
      await exportAllPals();
    } catch (error) {
      console.error('Error exporting all pals:', error);
      Alert.alert('Export Error', 'Failed to export all pals.');
    }
    closeMenu();
  };

  const onPressImportPals = async () => {
    try {
      const count = await importPals();
      if (count > 0) {
        Alert.alert(
          'Import Success',
          l10n.components.palHeaderRight.importSuccess.replace(
            '{{count}}',
            count.toString(),
          ),
        );
      }
    } catch (error) {
      console.error('Error importing pals:', error);
      Alert.alert('Import Error', l10n.components.palHeaderRight.importError);
    }
    closeMenu();
  };

  return (
    <View style={styles.container}>
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchorPosition="bottom"
        anchor={
          <IconButton
            icon={() => <DotsVerticalIcon fill={theme.colors.primary} />}
            style={styles.menuBtn}
            onPress={openMenu}
            testID="menu-button"
          />
        }>
        <Menu.Item
          submenu={[
            <Menu.Item
              key="export-all"
              onPress={onPressExportAllPals}
              label={l10n.components.palHeaderRight.exportAllPals}
            />,
            <Menu.Item
              key="import"
              onPress={onPressImportPals}
              label={l10n.components.palHeaderRight.importPals}
            />,
          ]}
          label={l10n.components.headerRight.export}
          leadingIcon={() => <ShareIcon stroke={theme.colors.primary} />}
        />
      </Menu>
    </View>
  );
});
