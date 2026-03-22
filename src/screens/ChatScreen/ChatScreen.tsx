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

  const getCurrentSessionSettings = () => {
    const currentSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );
    return (
      currentSession?.completionSettings ??
      chatSessionStore.newChatCompletionSettings
    );
  };

  // UI toggle: show_thinking_bubble (controls ThinkingBubble rendering only)
  const thinkingEnabled = (() => {
    const settings = getCurrentSessionSettings();
    return settings.show_thinking_bubble ?? true;
  })();

  // Inference param: enable_thinking
  const enableThinkingEnabled = (() => {
    const settings = getCurrentSessionSettings();
    return settings.enable_thinking ?? true;
  })();

  // Inference param: reasoning_format (true = 'auto')
  const reasoningFormatEnabled = (() => {
    const settings = getCurrentSessionSettings();
    return settings.reasoning_format === 'auto';
  })();

  // Show loading bubble only during the thinking phase (inferencing but not streaming)
  const isThinking = modelStore.inferencing && !modelStore.isStreaming;
  const promptProcessingProgress = modelStore.promptProcessingProgress;

  const updateSessionSetting = async (patch: Record<string, unknown>) => {
    const currentSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );
    if (currentSession) {
      await chatSessionStore.updateSessionCompletionSettings({
        ...currentSession.completionSettings,
        ...patch,
      });
    } else {
      await chatSessionStore.setNewChatCompletionSettings({
        ...chatSessionStore.newChatCompletionSettings,
        ...patch,
      });
    }
  };

  // UI toggle: controls show_thinking_bubble (ThinkingBubble rendering)
  const handleThinkingToggle = async (enabled: boolean) => {
    await updateSessionSetting({show_thinking_bubble: enabled});
  };

  // Inference param toggle: enable_thinking
  const handleEnableThinkingToggle = async (enabled: boolean) => {
    await updateSessionSetting({enable_thinking: enabled});
  };

  // Inference param toggle: reasoning_format
  const handleReasoningFormatToggle = async (enabled: boolean) => {
    await updateSessionSetting({
      reasoning_format: enabled ? 'auto' : undefined,
    });
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
        promptProcessingProgress={promptProcessingProgress}
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
          isEnableThinkingOn: enableThinkingEnabled,
          onEnableThinkingToggle: handleEnableThinkingToggle,
          isReasoningFormatOn: reasoningFormatEnabled,
          onReasoningFormatToggle: handleReasoningFormatToggle,
        }}
        textInputProps={{
          placeholder: !modelStore.context
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
