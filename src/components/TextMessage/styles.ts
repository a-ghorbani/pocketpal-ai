import {StyleSheet} from 'react-native';

import {getUserAvatarNameColor} from '../../utils';
import {MessageType, Theme, User} from '../../utils/types';

export const styles = ({
  message,
  theme,
  user,
}: {
  message: MessageType.Text | MessageType.AssistantTurn;
  theme: Theme;
  user?: User;
}) =>
  StyleSheet.create({
    descriptionText: {
      ...(user?.id === message.author.id
        ? theme.fonts.sentMessageLinkDescriptionTextStyle
        : theme.fonts.receivedMessageLinkDescriptionTextStyle),
      marginTop: 4,
    },
    headerText: {
      ...theme.fonts.userNameTextStyle,
      color: getUserAvatarNameColor(
        message.author,
        theme.colors.userAvatarNameColors,
      ),
      marginBottom: 6,
    },
    titleText: {
      ...(user?.id === message.author.id
        ? theme.fonts.sentMessageLinkTitleTextStyle
        : theme.fonts.receivedMessageLinkTitleTextStyle),
    },
    text: {
      ...(user?.id === message.author.id
        ? theme.fonts.sentMessageBodyTextStyle
        : theme.fonts.receivedMessageBodyTextStyle),
    },
    textContainer: {
      marginHorizontal:
        user?.id === message.author.id
          ? theme.insets.messageInsetsHorizontal
          : 0,
      marginVertical: theme.insets.messageInsetsVertical,
    },
    imageContainer: {
      marginBottom: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    imageThumbnail: {
      width: 80,
      height: 80,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceVariant,
    },
    imageContent: {
      width: '100%',
      height: '100%',
    },
    attachmentChipsRow: {
      marginBottom: 6,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    attachmentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      maxWidth: 200,
    },
    attachmentChipText: {
      fontSize: 12,
      color: theme.colors.outline,
      flexShrink: 1,
    },
    imagePreviewModal: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    imagePreviewCloseButton: {
      position: 'absolute',
      top: 50,
      right: 20,
      zIndex: 1,
    },
    imagePreviewContent: {
      width: '100%',
      height: '80%',
    },
  });
