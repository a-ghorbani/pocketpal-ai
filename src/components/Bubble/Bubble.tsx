import type {ReactNode} from 'react';
import React, {useContext} from 'react';
import {Animated} from 'react-native';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {UserContext} from '../../utils';
import {MessageType} from '../../utils/types';

/**
 * Pure shape primitive (border, background, scale animation). Per D9
 * (WHAT §4d) Bubble no longer renders chrome — timing, copy, and any
 * future turn-level slots are owned by `AssistantTurnFooter` rendered
 * adjacent to the Bubble by `Message`. This collapses the
 * "chrome-in-Bubble" pattern that produced the duplicate-footer bug
 * for multi-step AssistantTurns.
 */
export const Bubble = ({
  child,
  message,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  nextMessageInGroup,
  scale = new Animated.Value(1),
}: {
  child: ReactNode;
  message: MessageType.Any;
  nextMessageInGroup: boolean;
  scale?: Animated.Value;
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
    <Animated.View
      testID={currentUserIsAuthor ? 'user-message' : 'ai-message'}
      style={[contentContainer, {transform: [{scale}]}]}>
      {child}
    </Animated.View>
  );
};
