import React from 'react';
import {Image, Text, View} from 'react-native';

import {ChevronRightIcon, UserIcon} from '../../../assets/icons';
import {Pressable} from '../../../components/ui/primitives/Pressable';

import {useTheme} from '../../../hooks';
import {getFullThumbnailUri} from '../../../utils/imageUtils';

import type {PalsHubPal} from '../../../types/palshub';

import {createSearchOverlayStyles} from './styles';

interface ExploreSearchResultRowProps {
  pal: PalsHubPal;
  onPress: (pal: PalsHubPal) => void;
}

export const ExploreSearchResultRow: React.FC<ExploreSearchResultRowProps> = ({
  pal,
  onPress,
}) => {
  const theme = useTheme();
  const styles = createSearchOverlayStyles(theme);

  return (
    <Pressable
      testID={`explore-search-result-row-${pal.id}`}
      accessibilityRole="button"
      accessibilityLabel={pal.title}
      onPress={() => onPress(pal)}
      style={styles.resultRow}>
      <View style={styles.resultAvatar}>
        {pal.thumbnail_url ? (
          <Image
            source={{uri: getFullThumbnailUri(pal.thumbnail_url)}}
            style={styles.resultAvatarImage}
          />
        ) : (
          <UserIcon stroke={theme.colors.onSurfaceVariant} />
        )}
      </View>

      <View style={styles.resultBody}>
        <Text style={styles.resultName} numberOfLines={1}>
          {pal.title}
        </Text>
        {pal.description ? (
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {pal.description}
          </Text>
        ) : null}
      </View>

      <ChevronRightIcon stroke={theme.colors.foregroundTertiary} />
    </Pressable>
  );
};
