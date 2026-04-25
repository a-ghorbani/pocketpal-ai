import React from 'react';

import {
  Menu as PaperMenu,
  MenuProps as PaperMenuProps,
} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../../../hooks';

import {createStyles} from './styles';

interface SubMenuProps extends Omit<PaperMenuProps, 'theme'> {}

export const SubMenu: React.FC<SubMenuProps> = ({
  visible,
  onDismiss,
  children,
  style,
  ...menuProps
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const statusBarHeight = useSafeAreaInsets().top;

  return (
    <PaperMenu
      visible={visible}
      onDismiss={onDismiss}
      style={[styles.menu, style]}
      contentStyle={styles.content}
      statusBarHeight={statusBarHeight}
      {...menuProps}>
      {children}
    </PaperMenu>
  );
};

/**
 * SubMenu component for nested menu items.
 *
 * Usage example:
 * ```tsx
 * <Menu.Item
 *   label="Advanced"
 *   submenu={[
 *     <Menu.Item
 *       key="1"
 *       label="Option 1"
 *     />,
 *     // Nested submenu
 *     <Menu.Item
 *       label="More Options"
 *       submenu={[
 *         <Menu.Item key="2.1" label="Sub Option 1" />,
 *         <Menu.Item key="2.2" label="Sub Option 2" />,
 *       ]}
 *     />,
 *     <Menu.Item
 *       key="3"
 *       label="Option 3"
 *     />,
 *   ]}
 * />
 * ```
 *
 * Features:
 * - Supports infinite nesting of submenus
 * - Parent menu dims when submenu is open
 * - Maintains consistent styling with parent menu
 */
