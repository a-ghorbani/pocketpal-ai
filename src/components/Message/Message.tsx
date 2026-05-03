import * as React from 'react';
import {Pressable, StyleSheet, Text, View, Animated} from 'react-native';

import {oneOf} from '@flyerhq/react-native-link-preview';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {useTheme} from '../../hooks';

import styles from './styles';
import {
  Avatar,
  StatusIcon,
  FileMessage,
  ImageMessage,
  TalentSurface,
  TextMessage,
  TextMessageTopLevelProps,
} from '..';

import {MessageType} from '../../utils/types';
import {excludeDerivedMessageProps, UserContext} from '../../utils';

// Inter-block spacing within a single AssistantTurn row. Matches the
// existing `marginVertical: 8` already used by HtmlPreviewBubble's own
// container, so a multi-step turn lines up visually with the existing
// HtmlPreview-after-text-bubble layout. The first block in a turn uses
// no extra top margin so single-step no-tool turns render identically
// to the legacy Text bubble snapshot.
const ASSISTANT_TURN_BLOCK_GAP = 8;
const turnBlockStyles = StyleSheet.create({
  blockSpacer: {marginTop: ASSISTANT_TURN_BLOCK_GAP},
});

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export interface MessageTopLevelProps extends TextMessageTopLevelProps {
  /**
   * True if THIS row is the active agent run. Computed once at the
   * ChatView level (last message AND `agentUiState.status` is in the
   * active set) and threaded through. Used by the AssistantTurn
   * renderer to drive per-talent pending UI.
   */
  isActiveRun?: boolean;
  /**
   * Active-run pending talent names (from `agentUiState.pendingTalentNames`).
   * Only consulted when `isActiveRun` is true.
   */
  activeRunPendingTalentNames?: string[];
  /**
   * True if the active run is currently in `generating_tool_call`
   * status. Used by TalentSurface as a final fallback for the generic
   * "preparing tool" copy.
   */
  isGeneratingToolCall?: boolean;
  /** Called when user makes a long press on any message */
  onMessageLongPress?: (message: MessageType.Any, event?: any) => void;
  /** Called when user taps on any message */
  onMessagePress?: (message: MessageType.Any, event?: any) => void;
  /** Customize the default bubble using this function. `child` is a content
   * you should render inside your bubble, `message` is a current message
   * (contains `author` inside) and `nextMessageInGroup` allows you to see
   * if the message is a part of a group (messages are grouped when written
   * in quick succession by the same author) */
  renderBubble?: (payload: {
    child: React.ReactNode;
    message: MessageType.Any;
    nextMessageInGroup: boolean;
    scale?: Animated.Value;
  }) => React.ReactNode;
  /** Render a custom message inside predefined bubble */
  renderCustomMessage?: (
    message: MessageType.Custom,
    messageWidth: number,
  ) => React.ReactNode;
  /** Render a file message inside predefined bubble */
  renderFileMessage?: (
    message: MessageType.File,
    messageWidth: number,
  ) => React.ReactNode;
  /** Render an image message inside predefined bubble */
  renderImageMessage?: (
    message: MessageType.Image,
    messageWidth: number,
  ) => React.ReactNode;
  /** Render a text message inside predefined bubble */
  renderTextMessage?: (
    message: MessageType.Text,
    messageWidth: number,
    showName: boolean,
  ) => React.ReactNode;
  /** Show user avatars for received messages. Useful for a group chat. */
  showUserAvatars?: boolean;
}

export interface MessageProps extends MessageTopLevelProps {
  enableAnimation?: boolean;
  message: MessageType.DerivedAny;
  messageWidth: number;
  roundBorder: boolean;
  showAvatar: boolean;
  showName: boolean;
  showStatus: boolean;
}

/** Base component for all message types in the chat. Renders bubbles around
 * messages and status. Sets maximum width for a message for
 * a nice look on larger screens. */
export const Message = React.memo(
  ({
    enableAnimation,
    isActiveRun,
    activeRunPendingTalentNames,
    isGeneratingToolCall,
    message,
    messageWidth,
    onMessagePress,
    onMessageLongPress,
    onPreviewDataFetched,
    renderBubble,
    renderCustomMessage,
    renderFileMessage,
    renderImageMessage,
    renderTextMessage,
    roundBorder,
    showAvatar,
    showName,
    showStatus,
    showUserAvatars,
    usePreviewData,
  }: MessageProps) => {
    const user = React.useContext(UserContext);
    const theme = useTheme();
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const currentUserIsAuthor =
      message.type !== 'dateHeader' && user?.id === message.author.id;

    const {container, contentContainer, dateHeader, pressable} = styles({
      currentUserIsAuthor,
      message,
      messageWidth,
      roundBorder,
      theme,
    });

    const handlePressIn = () => {
      Animated.spring(scaleAnim, {
        toValue: 1.01,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }).start();
    };

    if (message.type === 'dateHeader') {
      return (
        <View style={dateHeader}>
          <Text
            style={[
              theme.fonts.dateDividerTextStyle,
              {color: theme.colors.onSurface},
            ]}>
            {message.text}
          </Text>
        </View>
      );
    }

    const renderBubbleContainer = () => {
      const child = renderMessage();

      return oneOf(
        renderBubble,
        <View style={contentContainer} testID="ContentContainer">
          {child}
        </View>,
      )({
        child,
        message: excludeDerivedMessageProps(message),
        nextMessageInGroup: roundBorder,
        scale: scaleAnim,
      });
    };

    const renderMessage = () => {
      switch (message.type) {
        case 'custom':
          return (
            renderCustomMessage?.(
              // It's okay to cast here since we checked message type above
              // type-coverage:ignore-next-line
              excludeDerivedMessageProps(message) as MessageType.Custom,
              messageWidth,
            ) ?? null
          );
        case 'file':
          return oneOf(renderFileMessage, <FileMessage message={message} />)(
            // type-coverage:ignore-next-line
            excludeDerivedMessageProps(message) as MessageType.File,
            messageWidth,
          );
        case 'image':
          return oneOf(
            renderImageMessage,
            <ImageMessage
              {...{
                message,
                messageWidth,
              }}
            />,
          )(
            // type-coverage:ignore-next-line
            excludeDerivedMessageProps(message) as MessageType.Image,
            messageWidth,
          );
        case 'text':
          return oneOf(
            renderTextMessage,
            <TextMessage
              {...{
                enableAnimation,
                message,
                messageWidth,
                onPreviewDataFetched,
                showName,
                usePreviewData,
              }}
            />,
          )(
            // type-coverage:ignore-next-line
            excludeDerivedMessageProps(message) as MessageType.Text,
            messageWidth,
            showName,
          );
        default:
          return null;
      }
    };

    /**
     * AssistantTurn renderer (Option B): emit N visual blocks within
     * ONE FlatList row. For each step, render a text bubble fragment
     * (only when content is present) followed by a TalentSurface
     * fragment (only when toolCalls are present). The row remains a
     * single Pressable so long-press routing stays turn-level
     * regardless of which inner block was pressed.
     */
    const renderAssistantTurn = () => {
      const turn = message as MessageType.DerivedAssistantTurn;
      const steps = turn.steps ?? [];
      const lastIdx = steps.length - 1;
      const blocks: React.ReactNode[] = [];
      let isFirstBlock = true;

      steps.forEach((step, stepIdx) => {
        const stepIsActive = isActiveRun && stepIdx === lastIdx;

        // Text/reasoning bubble — only when there's something to show.
        // The bubble wraps a TextMessage(step) so per-step content
        // routes through the same markdown / link-preview machinery.
        if (
          (step.content && step.content.length > 0) ||
          (step.reasoningContent && step.reasoningContent.length > 0)
        ) {
          const child = (
            <TextMessage
              enableAnimation={enableAnimation}
              message={turn}
              messageWidth={messageWidth}
              onPreviewDataFetched={onPreviewDataFetched}
              showName={showName && isFirstBlock}
              usePreviewData={usePreviewData}
              step={step}
            />
          );
          const wrapped = oneOf(
            renderBubble,
            <View
              style={[
                contentContainer,
                !isFirstBlock && turnBlockStyles.blockSpacer,
              ]}
              testID="ContentContainer">
              {child}
            </View>,
          )({
            child,
            message: excludeDerivedMessageProps(message),
            nextMessageInGroup: roundBorder,
            scale: scaleAnim,
          });
          blocks.push(
            <View
              key={`step-${stepIdx}-text`}
              style={!isFirstBlock ? turnBlockStyles.blockSpacer : undefined}>
              {wrapped}
            </View>,
          );
          isFirstBlock = false;
        }

        // Talent surface — outside the bubble, with its own visual
        // container (e.g. HtmlPreviewBubble). Renders nothing if the
        // step has no toolCalls and we're not actively generating one.
        const showTalentSurface =
          (step.toolCalls && step.toolCalls.length > 0) ||
          (stepIsActive &&
            ((activeRunPendingTalentNames?.length ?? 0) > 0 ||
              isGeneratingToolCall));
        if (showTalentSurface) {
          blocks.push(
            <View
              key={`step-${stepIdx}-talent`}
              style={!isFirstBlock ? turnBlockStyles.blockSpacer : undefined}>
              <TalentSurface
                step={step}
                isActiveRun={stepIsActive}
                pendingTalentNames={
                  stepIsActive ? activeRunPendingTalentNames : undefined
                }
                isGeneratingToolCall={
                  stepIsActive ? isGeneratingToolCall : false
                }
              />
            </View>,
          );
          isFirstBlock = false;
        }
      });

      return blocks;
    };

    // AssistantTurn renders N visual blocks within ONE FlatList row.
    // The single Pressable + Avatar + StatusIcon wrapping is preserved
    // so long-press routing stays turn-level (selectedMessage holds the
    // turn id) and avatar shows once per turn.
    const innerContent =
      message.type === 'assistant_turn' ? (
        <View>{renderAssistantTurn()}</View>
      ) : (
        renderBubbleContainer()
      );

    return (
      <View style={container}>
        <Avatar
          {...{
            author: message.author,
            currentUserIsAuthor,
            showAvatar,
            showUserAvatars,
            theme,
          }}
        />
        <Pressable
          onLongPress={event => {
            ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
            onMessageLongPress?.(excludeDerivedMessageProps(message), event);
          }}
          onPress={event => {
            onMessagePress?.(excludeDerivedMessageProps(message), event);
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={pressable}>
          {innerContent}
        </Pressable>
        <StatusIcon
          {...{
            currentUserIsAuthor,
            showStatus,
            status: message.status,
            theme,
          }}
        />
      </View>
    );
  },
);
