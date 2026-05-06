import * as React from 'react';
import {Pressable, StyleSheet, Text, View, Animated} from 'react-native';

import {oneOf} from '@flyerhq/react-native-link-preview';
import {observer} from 'mobx-react';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {useTheme} from '../../hooks';

import styles from './styles';
import {
  AssistantTurnFooter,
  Avatar,
  StatusIcon,
  FileMessage,
  ImageMessage,
  ReasoningBlock,
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
// Tightened from 8 → 4 (Idea F). With the auto-collapsed text-only
// reasoning row and the smaller tool chip, an 8px gap between every
// inner block bloated short turns ("what time is it now?" had visible
// dead space between every annotation). 4px keeps the visual rhythm
// without the airiness.
const ASSISTANT_TURN_BLOCK_GAP = 4;
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
 * a nice look on larger screens.
 *
 * Wrapped with `observer` (mobx-react) — without it, per-token mutations of
 * `step.content` via `chatSessionStore.applyStreamingUpdate` (which replaces
 * `turn.steps[lastIdx]` with a new object) would NOT trigger this component
 * to re-render. The AssistantTurn message reference itself is stable across
 * streaming, so a plain `React.memo` would skip every per-token update and
 * the chat would only refresh when an unrelated state transition (status
 * flip, keyboard event, scroll) happened to re-render the parent.
 *
 * `observer` already provides memo-equivalent shallow-prop comparison, so it
 * cleanly replaces `React.memo` here. See `chat-flow.md` §2 for the
 * single-writer streaming path this hooks into. */
export const Message = observer(
  ({
    enableAnimation,
    // isActiveRun / activeRunPendingTalentNames / isGeneratingToolCall
    // are kept on MessageTopLevelProps for ChatView's existing prop
    // API but are no longer consumed here — pending UX is owned by
    // ChatView's PendingIndicator (D4 / I4) and TalentSurface
    // dispatches off persisted step data alone (WHAT §4a).
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
      const blocks: React.ReactNode[] = [];
      // `isFirstBlock` drives the inter-block spacer (no top margin on
      // the first block). `nameShown` tracks whether the author header
      // has already been rendered — reasoning blocks never render the
      // header (they're metadata, not chat posts), so the showName
      // slot passes through to the first content/talent block.
      let isFirstBlock = true;
      let nameShown = false;

      // Wraps a single TextMessage step fragment in the chat-bubble
      // shell (contentContainer / renderBubble) plus the turn-block
      // spacer. Used for content blocks only — reasoning has its own
      // wrapper via `wrapReasoningBlock` because it's not a bubble.
      const wrapTextBlock = (
        keySuffix: string,
        stepFragment: (typeof steps)[number],
      ) => {
        const showNameForBlock = showName && !nameShown;
        const child = (
          <TextMessage
            enableAnimation={enableAnimation}
            message={turn}
            messageWidth={messageWidth}
            onPreviewDataFetched={onPreviewDataFetched}
            showName={showNameForBlock}
            usePreviewData={usePreviewData}
            step={stepFragment}
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
        if (showNameForBlock) {
          nameShown = true;
        }
        return (
          <View
            key={keySuffix}
            style={!isFirstBlock ? turnBlockStyles.blockSpacer : undefined}>
            {wrapped}
          </View>
        );
      };

      // Reasoning is metadata, not a chat bubble — it skips the
      // contentContainer / renderBubble shell entirely, so the
      // collapsed text-only row (and partial card) sit directly on
      // the chat surface with no bubble background or insets fighting
      // them. The author header is intentionally not shown here:
      // it belongs to the first true content block.
      const wrapReasoningBlock = (
        keySuffix: string,
        text: string,
        autoCollapse: boolean,
      ) => (
        <View
          key={keySuffix}
          style={!isFirstBlock ? turnBlockStyles.blockSpacer : undefined}
          testID="ContentContainer-reasoning">
          <ReasoningBlock
            text={text}
            maxWidth={messageWidth}
            autoCollapse={autoCollapse}
          />
        </View>
      );

      steps.forEach((step, stepIdx) => {
        // Per WHAT §4a / D3: reasoning and content render as SEPARATE
        // blocks, reasoning first (matches model emission order). Each
        // block is skipped when its source field is empty so a step
        // with content-only or reasoning-only renders exactly one
        // block (no phantom layout). Spacing between blocks is handled
        // by `turnBlockStyles.blockSpacer`.
        const hasReasoning =
          step.reasoningContent !== undefined &&
          step.reasoningContent.length > 0;
        const hasContent =
          step.content !== undefined && step.content.length > 0;

        if (hasReasoning) {
          // Auto-collapse the reasoning bubble once content has begun
          // streaming OR the step has finalized. Streaming reasoning
          // alone (before content starts) keeps the bubble in PARTIAL
          // so the user sees thoughts live; once the model has moved
          // on to content, the bubble shrinks to its text-only form.
          const autoCollapseReasoning = hasContent || step.partial === false;
          blocks.push(
            wrapReasoningBlock(
              `step-${stepIdx}-reasoning`,
              step.reasoningContent as string,
              autoCollapseReasoning,
            ),
          );
          isFirstBlock = false;
        }

        if (hasContent) {
          blocks.push(wrapTextBlock(`step-${stepIdx}-text`, step));
          isFirstBlock = false;
        }

        // Talent surface — outside the bubble, with its own visual
        // container (e.g. HtmlPreviewBubble). Renders one block per
        // call in step.toolCalls (in array order). Per WHAT §4a, the
        // ChatView-owned PendingIndicator covers the in-flight window
        // before tool outcomes land — there is no per-call pending UI
        // here.
        if (step.toolCalls && step.toolCalls.length > 0) {
          blocks.push(
            <View
              key={`step-${stepIdx}-talent`}
              style={!isFirstBlock ? turnBlockStyles.blockSpacer : undefined}>
              <TalentSurface step={step} />
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
    //
    // Per WHAT §4b / D9 / I1: ONE AssistantTurnFooter per assistant
    // row, attached HERE in the outer JSX (not inside renderMessage())
    // so:
    //   - AssistantTurn rows render N step blocks then one footer
    //     (regardless of step count — fixes the duplicate-footer bug
    //     by construction).
    //   - Legacy assistant Text rows still get exactly one footer
    //     (chrome moves out of Bubble, into here).
    //   - User-authored Text rows render no footer (no behaviour
    //     change for the user side).
    const showAssistantFooter =
      !currentUserIsAuthor &&
      (message.type === 'assistant_turn' || message.type === 'text');
    const innerContent =
      message.type === 'assistant_turn' ? (
        <View>
          {renderAssistantTurn()}
          {showAssistantFooter && <AssistantTurnFooter message={message} />}
        </View>
      ) : (
        <>
          {renderBubbleContainer()}
          {showAssistantFooter && <AssistantTurnFooter message={message} />}
        </>
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
