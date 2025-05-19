import React, {useRef, ReactNode} from 'react';

import {observer} from 'mobx-react';

import {Bubble, ChatView} from '../../components';

import {useChatSession} from '../../hooks';

import {modelStore, chatSessionStore, palStore} from '../../store';

import {L10nContext} from '../../utils';
import {MessageType} from '../../utils/types';
import {user, assistant} from '../../utils/chat';

import {CameraPalScreen} from './CameraPalScreen';
import {VideoPalScreen} from './VideoPalScreen';
import {PalType} from '../../components/PalsSheets/types';

const renderBubble = ({
  child,
  message,
  nextMessageInGroup,
  scale,
}: {
  child: ReactNode;
  message: MessageType.Any;
  nextMessageInGroup: boolean;
  scale?: any;
}) => (
  <Bubble
    child={child}
    message={message}
    nextMessageInGroup={nextMessageInGroup}
    scale={scale}
  />
);

export const ChatScreen: React.FC = observer(() => {
  const currentMessageInfo = useRef<{
    createdAt: number;
    id: string;
    sessionId: string;
  } | null>(null);
  const l10n = React.useContext(L10nContext);

  const {handleSendPress, handleStopPress} = useChatSession(
    currentMessageInfo,
    user,
    assistant,
  );

  // Show loading bubble only during the thinking phase (inferencing but not streaming)
  const isThinking = modelStore.inferencing && !modelStore.isStreaming;

  const activePalId = chatSessionStore.activePalId;
  const activePal = activePalId
    ? palStore.pals.find(p => p.id === activePalId)
    : undefined;
  const isCameraPal = activePal?.palType === PalType.CAMERA;
  const isVideoPal = activePal?.palType === PalType.VIDEO;

  // If the active pal is a camera pal, show the camera pal screen
  if (isCameraPal) {
    return <CameraPalScreen />;
  }

  // If the active pal is a video pal, show the video pal screen
  if (isVideoPal) {
    return <VideoPalScreen />;
  }

  // Otherwise, show the regular chat view
  return (
    <ChatView
      renderBubble={renderBubble}
      messages={chatSessionStore.currentSessionMessages}
      onSendPress={handleSendPress}
      onStopPress={handleStopPress}
      user={user}
      isStopVisible={modelStore.inferencing}
      isThinking={isThinking}
      isStreaming={modelStore.isStreaming}
      sendButtonVisibilityMode="editing"
      textInputProps={{
        editable: !!modelStore.context,
        placeholder: !modelStore.context
          ? modelStore.isContextLoading
            ? l10n.chat.loadingModel
            : l10n.chat.modelNotLoaded
          : l10n.chat.typeYourMessage,
      }}
    />
  );
});
