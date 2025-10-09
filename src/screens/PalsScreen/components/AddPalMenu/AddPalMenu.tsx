import React, {useState, useContext} from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {PlusIcon} from '../../../../assets/icons';
import {Menu} from '../../../../components/Menu';

import {useTheme} from '../../../../hooks';
import {L10nContext} from '../../../../utils';
import {createStyles} from './styles';

interface AddPalMenuProps {
  iconColor: string;
  iconSize: number;
  onCreatePal: (type: 'assistant' | 'roleplay' | 'video') => void;
}

export const AddPalMenu: React.FC<AddPalMenuProps> = observer(
  ({iconColor, iconSize, onCreatePal}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const [menuVisible, setMenuVisible] = useState(false);

    const openMenu = () => setMenuVisible(true);
    const closeMenu = () => setMenuVisible(false);

    const handleCreateAssistant = () => {
      closeMenu();
      onCreatePal('assistant');
    };

    const handleCreateRoleplay = () => {
      closeMenu();
      onCreatePal('roleplay');
    };

    const handleCreateVideo = () => {
      closeMenu();
      onCreatePal('video');
    };

    return (
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchorPosition="top"
        anchor={
          <TouchableOpacity
            style={styles.addButton}
            onPress={openMenu}
            testID="bottom-action-add">
            <View style={styles.iconContainer}>
              <PlusIcon stroke={iconColor} width={iconSize} height={iconSize} />
            </View>
            <Text style={styles.actionLabel}>{l10n.palsScreen.addPal}</Text>
          </TouchableOpacity>
        }>
        <Menu.Item
          icon="account"
          onPress={handleCreateAssistant}
          label={l10n.palsScreen.assistant}
        />
        <Menu.Item
          icon="drama-masks"
          onPress={handleCreateRoleplay}
          label={l10n.palsScreen.roleplay}
        />
        <Menu.Item
          icon="video"
          onPress={handleCreateVideo}
          label={l10n.palsScreen.video}
        />
      </Menu>
    );
  },
);
