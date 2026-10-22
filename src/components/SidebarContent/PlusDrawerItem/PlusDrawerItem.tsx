import React, {useContext} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {SparkleFilledIcon, SparkleIcon} from '../../../assets/icons';
import {useTheme} from '../../../hooks';
import {t} from '../../../locales';
import {L10nContext} from '../../../utils';
import type {Theme} from '../../../utils/types';
import {isPlusAvailable, isPlusUnlocked} from '../../../services/plus/gate';
import {shippedPlusFeatures} from '../../../services/plus/shipped';

interface PlusDrawerItemProps {
  onPress: () => void;
}

export const PlusDrawerItem: React.FC<PlusDrawerItemProps> = observer(
  ({onPress}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    if (!isPlusAvailable()) {
      return null;
    }
    const styles = createStyles(theme);
    const copy = l10n.plus;
    const unlocked = isPlusUnlocked();
    const Sparkle = unlocked ? SparkleFilledIcon : SparkleIcon;
    const names = shippedPlusFeatures().map(
      feature => copy.features[feature.id],
    );
    const [first, second = ''] = names;
    const subtitle = unlocked
      ? copy.sidebar.unlocked
      : t(
          names.length === 1
            ? copy.sidebar.subtitleOne
            : names.length === 2
              ? copy.sidebar.subtitleTwo
              : copy.sidebar.subtitleMore,
          {first, second},
        );
    return (
      <Pressable
        testID="drawer-item-plus"
        accessibilityRole="button"
        accessibilityLabel={copy.sidebar.title}
        accessibilityValue={{text: subtitle}}
        onPress={onPress}
        style={({pressed}) => [styles.row, pressed && styles.pressed]}>
        <Sparkle width={24} height={24} fill={theme.colors.secondary} />
        <View style={styles.body}>
          <Text style={styles.label}>{copy.sidebar.title}</Text>
          <Text
            testID="drawer-item-plus-subtitle"
            style={styles.subtitle}
            numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
    );
  },
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      minHeight: 44,
      marginHorizontal: 12,
      paddingLeft: 16,
      paddingRight: 24,
      paddingVertical: theme.spacing.xs,
      borderRadius: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    pressed: {
      backgroundColor: theme.colors.menuBackgroundActive,
    },
    body: {
      flex: 1,
      gap: 1,
    },
    label: {
      ...theme.fonts.labelLarge,
      color: theme.colors.onSurfaceVariant,
    },
    subtitle: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      opacity: 0.8,
    },
  });
