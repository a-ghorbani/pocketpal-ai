import React, {useRef, useState} from 'react';
import {View} from 'react-native';

import {Button, Icon, Text} from 'react-native-paper';

import {Menu} from '../../components';

import type {createStyles} from './styles';

import {CacheType} from '../../utils/types';

export const useMenuAnchor = () => {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<{x: number; y: number}>({x: 0, y: 0});
  const [visible, setVisible] = useState(false);

  const open = () =>
    ref.current?.measure((x, y, width, height, pageX, pageY) => {
      setAnchor({x: pageX, y: pageY + height});
      setVisible(true);
    });

  return {ref, anchor, visible, open, close: () => setVisible(false)};
};

export type MenuAnchor = ReturnType<typeof useMenuAnchor>;

const chevronDown = ({size, color}: {size: number; color: string}) => (
  <Icon source="chevron-down" size={size} color={color} />
);

interface CacheTypeMenuRowProps {
  menu: MenuAnchor;
  label: string;
  description?: string;
  value: string | undefined;
  valueLabel: string;
  options: Array<{value: CacheType; label: string; disabled: boolean}>;
  disabled: boolean;
  onSelect: (value: CacheType) => void;
  styles: ReturnType<typeof createStyles>;
  testID?: string;
}

export const CacheTypeMenuRow: React.FC<CacheTypeMenuRowProps> = ({
  menu,
  label,
  description,
  value,
  valueLabel,
  options,
  disabled,
  onSelect,
  styles,
  testID,
}) => (
  <View style={styles.settingItemContainer}>
    <View style={styles.switchContainer}>
      <View style={styles.textContainer}>
        <Text variant="titleMedium" style={styles.textLabel}>
          {label}
        </Text>
        {description !== undefined && (
          <Text variant="labelSmall" style={styles.textDescription}>
            {description}
          </Text>
        )}
      </View>
      <View style={styles.menuContainer}>
        <Button
          ref={menu.ref}
          mode="outlined"
          onPress={menu.open}
          style={styles.menuButton}
          contentStyle={styles.buttonContent}
          testID={testID}
          disabled={disabled}
          icon={chevronDown}>
          {valueLabel}
        </Button>
        <Menu
          visible={menu.visible}
          onDismiss={menu.close}
          anchor={menu.anchor}
          selectable>
          {options.map(option => (
            <Menu.Item
              key={option.value}
              style={styles.menu}
              label={option.label}
              selected={option.value === value}
              disabled={option.disabled}
              onPress={() => {
                if (!option.disabled) {
                  onSelect(option.value);
                  menu.close();
                }
              }}
            />
          ))}
        </Menu>
      </View>
    </View>
  </View>
);
