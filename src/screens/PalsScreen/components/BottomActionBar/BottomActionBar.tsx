import React, {useContext} from 'react';
import {View, TouchableOpacity} from 'react-native';

import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {SearchIcon, UserIcon} from '../../../../assets/icons';

import {useTheme} from '../../../../hooks';
import {L10nContext} from '../../../../utils';

import {createStyles} from './styles';
import {AddPalMenu} from '../AddPalMenu';

export type BottomActionType = 'search' | 'add' | 'profile';

interface BottomActionBarProps {
  activeAction: BottomActionType;
  onActionPress: (action: BottomActionType) => void;
  onCreatePal: (type: 'assistant' | 'roleplay' | 'video') => void;
  isAuthenticated: boolean;
}

interface ActionButtonProps {
  action: BottomActionType;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onPress: () => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  action,
  label,
  icon,
  onPress,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);

  return (
    <TouchableOpacity
      style={styles.actionButton}
      onPress={onPress}
      testID={`bottom-action-${action}`}>
      <View style={styles.iconContainer}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

export const BottomActionBar: React.FC<BottomActionBarProps> = observer(
  ({onActionPress, onCreatePal, isAuthenticated}) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const styles = createStyles(theme, insets);
    const l10n = useContext(L10nContext);

    const iconSize = 24;
    const iconColor = theme.colors.onSurfaceVariant;

    return (
      <View style={styles.container}>
        <View style={styles.actionBar}>
          {/* Search */}
          <ActionButton
            action="search"
            label={l10n.palsScreen.search}
            icon={
              <SearchIcon
                stroke={iconColor}
                width={iconSize}
                height={iconSize}
              />
            }
            isActive={false}
            onPress={() => onActionPress('search')}
          />

          {/* Add Pal Menu */}
          <AddPalMenu
            iconColor={iconColor}
            iconSize={iconSize}
            onCreatePal={onCreatePal}
          />

          {/* Profile */}
          <ActionButton
            action="profile"
            label={
              isAuthenticated ? l10n.palsScreen.profile : l10n.palsScreen.signIn
            }
            icon={
              <UserIcon stroke={iconColor} width={iconSize} height={iconSize} />
            }
            isActive={false}
            onPress={() => onActionPress('profile')}
          />
        </View>
      </View>
    );
  },
);
