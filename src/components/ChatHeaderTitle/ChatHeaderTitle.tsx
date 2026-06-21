import React, {useContext} from 'react';
import {Image, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {createStyles} from './styles';
import {useTheme} from '../../hooks';
import {chatSessionStore, modelStore, palStore} from '../../store';
import {L10nContext} from '../../utils';
import {getFullThumbnailUri} from '../../utils/imageUtils';

export const ChatHeaderTitle: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const activeModel = modelStore.activeModel;

  const activePalId = chatSessionStore.activePalId;
  const activePal = palStore.pals.find(pal => pal.id === activePalId);
  const palThumbnailUri = activePal?.thumbnail_url
    ? getFullThumbnailUri(activePal.thumbnail_url)
    : undefined;
  const palTileColor = activePal?.color?.[0] ?? theme.colors.secondaryDefault;

  const title = activePal?.name || l10n.components.chatHeaderTitle.defaultTitle;

  return (
    <View testID="chat-header-title" style={styles.container}>
      <View style={styles.avatar}>
        {palThumbnailUri ? (
          <Image source={{uri: palThumbnailUri}} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatarTile, {backgroundColor: palTileColor}]} />
        )}
        <View style={styles.onlineDot} />
      </View>
      <View style={styles.labels}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
        {activeModel?.name && (
          <Text numberOfLines={1} style={styles.model}>
            {activeModel.name}
          </Text>
        )}
      </View>
    </View>
  );
});
