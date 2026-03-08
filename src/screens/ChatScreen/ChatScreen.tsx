import React, {useRef, ReactNode, useState} from 'react';

import {observer} from 'mobx-react';

import {
  Bubble,
  ChatView,
  ErrorSnackbar,
  ModelErrorReportSheet,
} from '../../components';
import {PalSheet} from '../../components/PalsSheets';

import {useChatSession} from '../../hooks';
import {usePendingMessage} from '../../hooks/useDeepLinking';
import {Pal} from '../../types/pal';

import {modelStore, chatSessionStore, palStore, uiStore} from '../../store';
import {hasVideoCapability} from '../../utils/pal-capabilities';

import {L10nContext} from '../../utils';
import {MessageType} from '../../utils/types';
import {ErrorState} from '../../utils/errors';
import {user, assistant} from '../../utils/chat';

import {VideoPalScreen} from './VideoPalScreen';

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

  const activePalId = chatSessionStore.activePalId;
  const activePal = activePalId
    ? palStore.pals.find(p => p.id === activePalId)
    : undefined;
  const isVideoPal = activePal && hasVideoCapability(activePal);

  // State for pal sheet
  const [isPalSheetVisible, setIsPalSheetVisible] = useState(false);

  // State for model error report sheet
  const [isErrorReportVisible, setIsErrorReportVisible] = useState(false);
  const [errorToReport, setErrorToReport] = useState<ErrorState | null>(null);

  const {handleSendPress, handleStopPress, isMultimodalEnabled} =
    useChatSession(currentMessageInfo, user, assistant);

  // Handle deep linking for message prefill
  const {pendingMessage, clearPendingMessage} = usePendingMessage();

  // Callback handler for opening pal sheet
  const handleOpenPalSheet = React.useCallback((_pal: Pal) => {
    setIsPalSheetVisible(true);
  }, []);

  const handleClosePalSheet = React.useCallback(() => {
    setIsPalSheetVisible(false);
  }, []);

  // Handlers for model error report
  const handleReportModelError = React.useCallback(() => {
    if (modelStore.modelLoadError) {
      setErrorToReport(modelStore.modelLoadError);
      setIsErrorReportVisible(true);
      modelStore.clearModelLoadError();
    }
  }, []);

  const handleCloseErrorReport = React.useCallback(() => {
    setIsErrorReportVisible(false);
    setErrorToReport(null);
  }, []);

  // Check if multimodal is enabled
  const [multimodalEnabled, setMultimodalEnabled] = React.useState(false);

  React.useEffect(() => {
    const checkMultimodal = async () => {
      const enabled = await isMultimodalEnabled();
      setMultimodalEnabled(enabled);
    };

    checkMultimodal();
  }, [isMultimodalEnabled]);

  const thinkingSupported = modelStore.activeModel?.supportsThinking ?? false;

  const thinkingEnabled = (() => {
    const currentSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );
    const settings =
      currentSession?.completionSettings ??
      chatSessionStore.newChatCompletionSettings;
    return settings.enable_thinking ?? true;
  })();

  // Show loading bubble only during the thinking phase (inferencing but not streaming)
  const isThinking = modelStore.inferencing && !modelStore.isStreaming;

  const handleThinkingToggle = async (enabled: boolean) => {
    const currentSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );

    if (currentSession) {
      // Update session-specific settings
      const updatedSettings = {
        ...currentSession.completionSettings,
        enable_thinking: enabled,
      };
      await chatSessionStore.updateSessionCompletionSettings(updatedSettings);
    } else {
      // Update global settings for new chats
      const updatedSettings = {
        ...chatSessionStore.newChatCompletionSettings,
        enable_thinking: enabled,
      };
      await chatSessionStore.setNewChatCompletionSettings(updatedSettings);
    }
  };

  // If the active pal is a video pal, show the video pal screen
  if (isVideoPal) {
    return <VideoPalScreen activePal={activePal} />;
  }

  // Otherwise, show the regular chat view
  return (
    <>
      <ChatView
        renderBubble={renderBubble}
        messages={chatSessionStore.currentSessionMessages}
        activePal={activePal}
        onSendPress={handleSendPress}
        onStopPress={handleStopPress}
        onPalSettingsSelect={handleOpenPalSheet}
        user={user}
        isStopVisible={modelStore.inferencing}
        isThinking={isThinking}
        isStreaming={modelStore.isStreaming}
        sendButtonVisibilityMode="always"
        showImageUpload={true}
        isVisionEnabled={multimodalEnabled}
        initialInputText={pendingMessage || undefined}
        onInitialTextConsumed={clearPendingMessage}
        inputProps={{
          showThinkingToggle: thinkingSupported,
          isThinkingEnabled: thinkingEnabled,
          onThinkingToggle: handleThinkingToggle,
        }}
        textInputProps={{
          placeholder: !modelStore.engine
            ? modelStore.isContextLoading
              ? l10n.chat.loadingModel
              : l10n.chat.modelNotLoaded
            : l10n.chat.typeYourMessage,
        }}
      />
      {uiStore.chatWarning && (
        <ErrorSnackbar
          error={uiStore.chatWarning}
          onDismiss={() => uiStore.clearChatWarning()}
        />
      )}
      {modelStore.modelLoadError && (
        <ErrorSnackbar
          error={modelStore.modelLoadError}
          onDismiss={() => modelStore.clearModelLoadError()}
          onReport={handleReportModelError}
        />
      )}
      <ModelErrorReportSheet
        isVisible={isErrorReportVisible}
        onClose={handleCloseErrorReport}
        error={errorToReport}
      />
      {activePal && (
        <PalSheet
          isVisible={isPalSheetVisible}
          onClose={handleClosePalSheet}
          pal={activePal}
        />
      )}
    </>
  );
});
