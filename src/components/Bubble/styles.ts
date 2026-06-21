import {StyleSheet} from 'react-native';

import {MessageType, Theme} from '../../utils/types';

export const styles = ({
  currentUserIsAuthor,
  message,
  theme,
}: {
  currentUserIsAuthor: boolean;
  message: MessageType.Any;
  theme: Theme;
}) => {
  const userBubble = currentUserIsAuthor && message.type !== 'image';
  return StyleSheet.create({
    contentContainer: {
      backgroundColor: userBubble ? theme.colors.mutedLight : 'transparent',
      borderColor: 'transparent',
      borderRadius: 16,
      // Tail: square off the bottom trailing corner on the user bubble.
      // Logical `end-end` so the tail mirrors under RTL.
      borderEndEndRadius: userBubble ? 2 : 16,
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    dateHeader: {
      //textAlign: 'right',
      color: theme.colors.textSecondary,
      fontSize: 10,
    },
    iconContainer: {
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
  });
};
