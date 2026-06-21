import React, {useContext} from 'react';
import {Image, Text, View} from 'react-native';

import {Card, Chip} from '../../../components/ui';
import {DownloadIcon, StarIcon, UserIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {formatPriceCents} from '../../../utils/formatters';
import {getFullThumbnailUri} from '../../../utils/imageUtils';

import {uiStore} from '../../../store';

import type {PalsHubPal} from '../../../types/palshub';

import {createCardStyles} from './styles';

interface PalCardListProps {
  pal: PalsHubPal;
  onPress: (pal: PalsHubPal) => void;
}

export const PalCardList: React.FC<PalCardListProps> = ({pal, onPress}) => {
  const theme = useTheme();
  const styles = createCardStyles(theme);
  const l10n = useContext(L10nContext);

  const isFree = pal.price_cents === 0;
  const categories = pal.categories ?? [];
  const visibleCategories = categories.slice(0, 1);
  const extraCount = categories.length - visibleCategories.length;

  return (
    <Card
      testID={`explore-pal-card-${pal.id}`}
      variant="outlined"
      onPress={() => onPress(pal)}
      accessibilityRole="button"
      accessibilityLabel={pal.title}
      style={styles.card}>
      {!isFree ? (
        <View style={styles.pricePill} pointerEvents="none">
          <Text
            testID={`explore-pal-price-${pal.id}`}
            style={styles.pricePillText}>
            {formatPriceCents(pal.price_cents, uiStore.language)}
          </Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.avatar}>
          {pal.thumbnail_url ? (
            <Image
              source={{uri: getFullThumbnailUri(pal.thumbnail_url)}}
              style={styles.avatarImage}
            />
          ) : (
            <UserIcon stroke={theme.colors.onSurfaceVariant} />
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {pal.title}
            </Text>
            {isFree ? (
              <Text
                testID={`explore-pal-price-${pal.id}`}
                style={[styles.price, styles.priceFree]}>
                {l10n.explore.free}
              </Text>
            ) : null}
          </View>

          {pal.description ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {pal.description}
            </Text>
          ) : null}

          {(visibleCategories.length > 0 || extraCount > 0) && (
            <View style={styles.categoryRow}>
              {visibleCategories.map(category => (
                <Chip
                  key={category.id}
                  variant="display"
                  size="s"
                  label={category.name}
                  accessibilityLabel={category.name}
                />
              ))}
              {extraCount > 0 ? (
                <Text style={styles.extraCount}>{`+${extraCount}`}</Text>
              ) : null}
            </View>
          )}

          <View style={styles.metaRow}>
            <View style={styles.rating}>
              <StarIcon
                stroke={theme.colors.primary}
                fill={theme.colors.primary}
              />
              <Text style={styles.ratingText}>
                {pal.average_rating ? pal.average_rating.toFixed(1) : '—'}
              </Text>
              <Text style={styles.reviewCount}>{pal.review_count ?? 0}</Text>
            </View>

            <View style={styles.getAction}>
              <Text style={styles.getActionText}>{l10n.explore.getPal}</Text>
              <DownloadIcon stroke={theme.colors.primary} />
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
};
