import {StyleSheet} from 'react-native';

import {MessageType, Theme} from '../../utils/types';

export const styles = ({
  currentUserIsAuthor,
  message,
  roundBorder,
  theme,
}: {
  currentUserIsAuthor: boolean;
  message: MessageType.Any;
  roundBorder: boolean;
  theme: Theme;
}) => {
  return StyleSheet.create({
    contentContainer: {
      backgroundColor:
        !currentUserIsAuthor || message.type === 'image'
          ? 'transparent' //theme.colors.secondary
          : theme.colors.authorBubbleBackground,
      borderBottomLeftRadius:
        currentUserIsAuthor || roundBorder
          ? theme.borders.messageBorderRadius
          : 0,
      borderBottomRightRadius: currentUserIsAuthor
        ? roundBorder
          ? theme.borders.messageBorderRadius
          : 0
        : theme.borders.messageBorderRadius,
      borderColor: 'transparent',
      borderRadius: theme.borders.messageBorderRadius,
      overflow: 'hidden',
    },
    dateHeader0: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 32,
      marginTop: 16,
    },
    dateHeaderContainer: {
      textAlign: 'right',
      paddingBottom: 12,
      marginTop: -8,
      marginLeft: 20,
      flexDirection: 'row', // Added to align items horizontally
      alignItems: 'center', // Align items vertically centered
    },
    dateHeader: {
      //textAlign: 'right',
      color: theme.colors.textSecondary,
      fontSize: 10,
    },
    iconContainer: {
      marginRight: 5,
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
  });
};
