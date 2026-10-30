import type {ReactNode} from 'react';
import React, {useContext} from 'react';
import {View} from 'react-native';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {UserContext} from '../../utils';
import {MessageType} from '../../utils/types';

/**
 * Pure shape primitive (border, background). Chrome —
 * timing, copy, and any other turn-level slots — is owned by
 * `AssistantTurnFooter` rendered adjacent to the Bubble by `Message`.
 */
export const Bubble = ({
  child,
  message,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  nextMessageInGroup,
}: {
  child: ReactNode;
  message: MessageType.Any;
  nextMessageInGroup: boolean;
}) => {
  const theme = useTheme();
  const user = useContext(UserContext);
  const currentUserIsAuthor = user?.id === message.author.id;

  const {contentContainer} = styles({
    currentUserIsAuthor,
    message,
    roundBorder: true,
    theme,
  });

  return (
    <View
      testID={currentUserIsAuthor ? 'user-message' : 'ai-message'}
      style={contentContainer}>
      {child}
    </View>
  );
};
