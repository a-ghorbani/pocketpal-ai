import React, {useContext, useState} from 'react';
import {Alert, Image, View} from 'react-native';

import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {DotsHorizontalIcon} from '../../../../assets/icons';
import {Card, Chip, IconButton} from '../../../../components/ui';
import {Menu} from '../../../../components/Menu';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';

import type {Pal} from '../../../../store/PalStore';
import {palStore} from '../../../../store/PalStore';

import {L10nContext} from '../../../../utils';
import {t} from '../../../../locales';
import {exportPal} from '../../../../utils/exportUtils';
import {getContrastColor} from '../../../../utils/colorUtils';
import {getFullThumbnailUri} from '../../../../utils/imageUtils';

interface MyPalsCardProps {
  pal: Pal;
  onPress: () => void;
  onEdit: () => void;
}

const getSubtitle = (pal: Pal): string => {
  if (pal.description && pal.description.trim().length > 0) {
    return pal.description.trim();
  }
  if (pal.systemPrompt && pal.systemPrompt.trim().length > 0) {
    return pal.systemPrompt.trim();
  }
  return '';
};

const Avatar: React.FC<{pal: Pal}> = ({pal}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const firstLetter = pal.name?.[0]?.toUpperCase() || 'P';
  const thumbnailUrl = pal.thumbnail_url
    ? getFullThumbnailUri(pal.thumbnail_url)
    : undefined;
  const baseColor =
    Array.isArray(pal.color) && pal.color.length >= 1
      ? pal.color[0]
      : undefined;

  return (
    <View
      style={[styles.avatar, baseColor ? {backgroundColor: baseColor} : null]}>
      {thumbnailUrl ? (
        <Image
          source={{uri: thumbnailUrl}}
          style={styles.avatarImage}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={[
            styles.avatarText,
            baseColor ? {color: getContrastColor(baseColor)} : null,
          ]}>
          {firstLetter}
        </Text>
      )}
    </View>
  );
};

export const MyPalsCard: React.FC<MyPalsCardProps> = observer(
  ({pal, onPress, onEdit}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const [menuVisible, setMenuVisible] = useState(false);

    const closeMenu = () => setMenuVisible(false);

    const handleEdit = () => {
      closeMenu();
      onEdit();
    };

    const handleShare = async () => {
      closeMenu();
      try {
        await exportPal(pal.id);
      } catch (error) {
        console.error('Error sharing pal:', error);
      }
    };

    const handleDelete = () => {
      closeMenu();
      Alert.alert(
        l10n.palsScreen.deletePal,
        t(l10n.palsScreen.deletePalConfirmation, {palName: pal.name}),
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: () => palStore.deletePal(pal.id),
          },
        ],
      );
    };

    const subtitle = getSubtitle(pal);
    const categories = pal.categories ?? [];
    const visibleCategories = categories.slice(0, 2);
    const overflowCount = categories.length - visibleCategories.length;

    return (
      <Card
        variant="outlined"
        style={styles.card}
        onPress={onPress}
        accessibilityLabel={pal.name}
        testID={`local-pal-card-${pal.id}`}>
        <View style={styles.row}>
          <Avatar pal={pal} />

          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {pal.name}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}

            {categories.length > 0 ? (
              <View style={styles.categories}>
                {visibleCategories.map(category => (
                  <Chip
                    key={category}
                    variant="display"
                    size="s"
                    label={category}
                    accessibilityLabel={category}
                    style={styles.categoryChip}
                  />
                ))}
                {overflowCount > 0 ? (
                  <Chip
                    variant="display"
                    size="s"
                    label={`+${overflowCount}`}
                    accessibilityLabel={`+${overflowCount}`}
                    style={styles.categoryChip}
                  />
                ) : null}
              </View>
            ) : null}
          </View>

          <Menu
            visible={menuVisible}
            onDismiss={closeMenu}
            anchor={
              <IconButton
                icon={
                  <DotsHorizontalIcon
                    stroke={theme.colors.foregroundSecondary}
                    width={20}
                    height={20}
                  />
                }
                accessibilityLabel={l10n.palsScreen.myPals.overflowMenu}
                onPress={() => setMenuVisible(true)}
                testID={`mypals-card-overflow-${pal.id}`}
              />
            }>
            <Menu.Item
              onPress={handleEdit}
              label={l10n.palsScreen.myPals.overflowEdit}
            />
            <Menu.Item
              onPress={handleShare}
              label={l10n.palsScreen.myPals.overflowShare}
            />
            <Menu.Item
              onPress={handleDelete}
              label={l10n.palsScreen.myPals.overflowDelete}
            />
          </Menu>
        </View>
      </Card>
    );
  },
);
