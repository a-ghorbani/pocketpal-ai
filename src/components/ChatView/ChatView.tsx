import * as React from 'react';
import {
  FlatList,
  FlatListProps,
  InteractionManager,
  LayoutAnimation,
  StatusBar,
  StatusBarProps,
  View,
  TouchableOpacity,
  Keyboard,
  Text,
} from 'react-native';

import dayjs from 'dayjs';
import {observer} from 'mobx-react';
import {Portal, Snackbar, Button as PaperButton} from 'react-native-paper';
import calendar from 'dayjs/plugin/calendar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  KeyboardStickyView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
} from 'react-native-reanimated';

import {useComponentSize} from '../KeyboardAccessoryView/hooks';

import {useTheme, useMessageActions, usePrevious} from '../../hooks';

import ImageView from './ImageView';
import {createStyles} from './styles';

import {chatSessionStore, modelStore} from '../../store';

import {MessageType, User} from '../../utils/types';
import {Pal} from '../../types/pal';
import {
  calculateChatMessages,
  unwrap,
  UserContext,
  L10nContext,
} from '../../utils';
import {hasVideoCapability} from '../../utils/pal-capabilities';

import {
  Message,
  MessageTopLevelProps,
  CircularActivityIndicator,
  ChatInput,
  ChatInputAdditionalProps,
  ChatInputTopLevelProps,
  IncreaseContextSheet,
  Menu,
  PendingIndicator,
  ChatPalModelPickerSheet,
  ChatHeader,
  ChatEmptyPlaceholder,
  VideoPalEmptyPlaceholder,
  ContentReportSheet,
  GreetingBubble,
  SuggestedPromptsRow,
} from '..';

import {
  effectiveNCtx,
  pickNextTier,
  resolveBannerVariant,
  type BannerVariant,
} from '../../utils/bannerVariantResolver';
import {derivedText} from '../../utils/chat';
import {hasEnoughMemoryWithNCtx} from '../../hooks/useMemoryCheck';
import {usePalLoadHint} from '../../hooks/usePalLoadHint';
import {ModelOrigin} from '../../utils/types';
import {t} from '../../locales';
import {
  AlertIcon,
  CopyIcon,
  GridIcon,
  PencilLineIcon,
  RefreshIcon,
} from '../../assets/icons';

type MenuItem = {
  label: string;
  onPress?: () => void;
  icon?: () => React.ReactNode;
  disabled: boolean;
  submenu?: SubMenuItem[];
};

type SubMenuItem = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  width?: number;
};

// Untestable
/* istanbul ignore next */
const animate = () => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
};

dayjs.extend(calendar);

export type ChatTopLevelProps = ChatInputTopLevelProps & MessageTopLevelProps;

export interface ChatProps extends ChatTopLevelProps {
  /** If {@link ChatProps.dateFormat} and/or {@link ChatProps.timeFormat} is not enough to
   * customize date headers in your case, use this to return an arbitrary
   * string based on a `dateTime` of a particular message. Can be helpful to
   * return "Today" if `dateTime` is today. IMPORTANT: this will replace
   * all default date headers, so you must handle all cases yourself, like
   * for example today, yesterday and before. Or you can just return the same
   * date header for any message. */
  customDateHeaderText?: (dateTime: number) => string;
  /** Custom content to display between the header and chat list */
  customContent?: React.ReactNode;
  /** Allows you to customize the date format. IMPORTANT: only for the date,
   * do not return time here. @see {@link ChatProps.timeFormat} to customize the time format.
   * @see {@link ChatProps.customDateHeaderText} for more customization. */
  dateFormat?: string;
  /** Disable automatic image preview on tap. */
  disableImageGallery?: boolean;
  /** Allows you to change what the user sees when there are no messages.
   * `emptyChatPlaceholder` and `emptyChatPlaceholderTextStyle` are ignored
   * in this case. */
  emptyState?: () => React.ReactNode;
  /** Use this to enable `LayoutAnimation`. Experimental on Android (same as React Native). */
  enableAnimation?: boolean;
  flatListProps?: Partial<FlatListProps<MessageType.DerivedAny[]>>;
  inputProps?: ChatInputAdditionalProps;
  /** Used for pagination (infinite scroll) together with {@link ChatProps.onEndReached}.
   * When true, indicates that there are no more pages to load and
   * pagination will not be triggered. */
  isLastPage?: boolean;
  /** Indicates if the AI is currently streaming tokens. Used by the
   * FlatList's `maintainVisibleContentPosition` to keep the latest
   * tokens in view while the stream lands. Pending UX is derived
   * inside ChatView from `chatSessionStore.agentUiState.status`. */
  isStreaming?: boolean;
  messages: MessageType.Any[];
  /** Used for pagination (infinite scroll). Called when user scrolls
   * to the very end of the list (minus `onEndReachedThreshold`).
   * See {@link ChatProps.flatListProps} to set it up. */
  onEndReached?: () => Promise<void>;
  /** The currently active pal */
  activePal?: Pal;
  /** Called when pal sheet should be opened */
  onPalSettingsSelect?: (pal: Pal) => void;
  /** Show user names for received messages. Useful for a group chat. Will be
   * shown only on text messages. */
  showUserNames?: boolean;
  /** Whether to show date headers between messages. Defaults to true. */
  showDateHeaders?: boolean;
  /** Whether to show the image upload button in the chat input */
  showImageUpload?: boolean;
  /** Whether to enable vision mode for the chat input */
  isVisionEnabled?: boolean;
  /** Initial text to prefill the input (e.g., from deep linking) */
  initialInputText?: string;
  /** Callback when initial text is consumed */
  onInitialTextConsumed?: () => void;
  /**
   * Allows you to customize the time format. IMPORTANT: only for the time,
   * do not return date here. @see {@link ChatProps.dateFormat} to customize the date format.
   * @see {@link ChatProps.customDateHeaderText} for more customization.
   */
  timeFormat?: string;
  user: User;
}

/**
 * Thin observer wrapper around PendingIndicator so the per-token
 * count + label updates only re-render this small subtree (and not
 * the entire FlatList header), keeping the dot animations alive and
 * the elapsed-seconds timer ticking. Without this isolation, MobX
 * re-renders ChatView on each token, the `renderListHeaderComponent`
 * useCallback would change reference (because it'd carry the count in
 * its deps), and FlatList would unmount + remount the header every
 * ~50ms — killing both Animated.loop and setInterval.
 */
const PendingIndicatorView: React.FC = observer(() => (
  <PendingIndicator
    pendingTalentNames={chatSessionStore.agentUiState.pendingTalentNames}
    toolCallTokenCount={chatSessionStore.toolCallTokenCount}
    isStopping={chatSessionStore.isStopping}
  />
));

/** Entry component, represents the complete chat */
export const ChatView = observer(
  ({
    customContent,
    customDateHeaderText,
    dateFormat,
    disableImageGallery,
    enableAnimation,
    flatListProps,
    inputProps,
    isLastPage,
    isStopVisible,
    isStreaming = false,
    messages,
    onEndReached,
    onMessageLongPress: externalOnMessageLongPress,
    onMessagePress,
    activePal,
    onPalSettingsSelect,
    onPreviewDataFetched,
    onSendPress,
    onStopPress,
    renderBubble,
    renderCustomMessage,
    renderFileMessage,
    renderImageMessage,
    renderTextMessage,
    sendButtonVisibilityMode = 'editing',
    showUserAvatars = false,
    showUserNames = false,
    showDateHeaders = false,
    showImageUpload = false,
    isVisionEnabled = false,
    initialInputText,
    onInitialTextConsumed,
    textInputProps,
    timeFormat,
    usePreviewData = true,
    user,
  }: ChatProps) => {
    // ============ THEME & LOCALIZATION ============
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles({theme});
    const insets = useSafeAreaInsets();

    // ============ REFS ============
    const animationRef = React.useRef(false);
    const list = React.useRef<FlatList<MessageType.DerivedAny>>(null);

    // ============ COMPONENT STATE ============
    // Input state
    const [inputText, setInputText] = React.useState('');
    const inputTextRef = React.useRef(inputText);
    inputTextRef.current = inputText;
    const [inputImages, setInputImages] = React.useState<string[]>([]);
    const [isPickerVisible, setIsPickerVisible] = React.useState(false);
    const [_selectedModel, setSelectedModel] = React.useState<string | null>(
      null,
    );
    const [_selectedPal, setSelectedPal] = React.useState<string | undefined>();

    // Image viewer state
    const [isImageViewVisible, setIsImageViewVisible] = React.useState(false);
    const [imageViewIndex, setImageViewIndex] = React.useState(0);
    const [stackEntry, setStackEntry] = React.useState<StatusBarProps>({});

    // Context menu state
    const [menuVisible, setMenuVisible] = React.useState(false);
    const [menuPosition, setMenuPosition] = React.useState({x: 0, y: 0});
    const [selectedMessage, setSelectedMessage] =
      React.useState<MessageType.Any | null>(null);
    const [isReportSheetVisible, setIsReportSheetVisible] =
      React.useState(false);

    // Pagination state
    const [isNextPageLoading, setNextPageLoading] = React.useState(false);

    // ============ COMPONENT SIZE TRACKING ============
    const {onLayout, size} = useComponentSize();
    const {onLayout: onLayoutChatInput, size: chatInputHeight} =
      useComponentSize();

    const bottomComponentHeight = React.useMemo(() => {
      const height = chatInputHeight.height;
      return height;
    }, [chatInputHeight.height]);

    // ============ INITIAL INPUT TEXT HANDLING ============
    // Handle initial input text from deep linking
    React.useEffect(() => {
      if (initialInputText && initialInputText.trim()) {
        setInputText(initialInputText);
        onInitialTextConsumed?.();
      }
    }, [initialInputText, onInitialTextConsumed]);

    // ============ DRAFT AUTOSAVE ============
    // Save draft on session switch, restore draft for new session
    const prevSessionId = usePrevious(chatSessionStore.activeSessionId);
    React.useEffect(() => {
      const NEW_CHAT_DRAFT_KEY = '__new_chat__';
      const prevKey = prevSessionId ?? NEW_CHAT_DRAFT_KEY;
      const newKey = chatSessionStore.activeSessionId ?? NEW_CHAT_DRAFT_KEY;

      // Save draft for the session we're leaving
      if (prevKey !== newKey) {
        chatSessionStore.saveDraft(prevKey, inputTextRef.current);
      }

      // Restore draft for the session we're entering
      const draft = chatSessionStore.getDraft(newKey);
      setInputText(draft);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- MobX observer makes activeSessionId reactive
    }, [chatSessionStore.activeSessionId]);

    // ============ ACTIVE PAL MODEL INITIALIZATION ============
    // Initialize model context when active pal changes.
    // Gate: while the e2e benchmark runner owns the native context lifecycle,
    // this auto-load must NOT fire — otherwise it shadows the matrix's per-cell
    // devices/n_gpu_layers via initContext's "already loaded → skip" path.
    React.useEffect(() => {
      if (modelStore.benchmarkActive) {
        return;
      }
      if (activePal) {
        if (!modelStore.activeModel && activePal.defaultModel) {
          const palDefaultModel = modelStore.availableModels.find(
            m => m.id === activePal.defaultModel?.id,
          );

          if (palDefaultModel) {
            // Initialize the model context
            modelStore.selectModel(palDefaultModel);
          }
        }
      }
    }, [activePal]);

    // ============ KEYBOARD ANIMATION SETUP ============
    // Get real-time keyboard height from the keyboard controller
    const keyboard = useReanimatedKeyboardAnimation();
    const trackingKeyboardMovement = useSharedValue(false);
    const bottomOffset = -insets.bottom;

    // Shared value that tracks the offset to apply when keyboard is moving up
    const keyboardOffsetBottom = useSharedValue(0);

    // Shared value to track if keyboard is visible (height > 0)
    const isKeyboardVisible = useSharedValue(false);

    // Animated style for input container padding
    // Apply bottom padding (safe area inset) only when keyboard is NOT visible
    const inputContainerAnimatedStyle = useAnimatedStyle(() => ({
      transform: [
        {translateY: keyboard.height.value - keyboardOffsetBottom.value},
      ],
      paddingBottom: isKeyboardVisible.value ? 0 : insets.bottom,
    }));

    // Suggested-prompts overlay shares the input's keyboard translation but
    // must NOT inherit paddingBottom (which the input uses to clear the
    // home indicator). Applying it here would create a large empty gap
    // between the chips and the input when the keyboard is closed.
    const suggestedPromptsAnimatedStyle = useAnimatedStyle(() => ({
      transform: [
        {translateY: keyboard.height.value - keyboardOffsetBottom.value},
      ],
    }));

    // Monitor keyboard height changes and animate the offset value
    useAnimatedReaction(
      () => -keyboard.height.value,
      (value, prevValue) => {
        if (prevValue !== null && value !== prevValue) {
          const isKeyboardMovingUp = value > prevValue;
          if (isKeyboardMovingUp !== trackingKeyboardMovement.value) {
            trackingKeyboardMovement.value = isKeyboardMovingUp;
            keyboardOffsetBottom.value = withTiming(
              isKeyboardMovingUp ? bottomOffset : 0,
              {
                duration: 200, // bottomOffset ? 150 : 400,
              },
            );
          }
        }
      },
      [keyboard, trackingKeyboardMovement, bottomOffset],
    );

    // ============ SCROLL TRACKING & SCROLL-TO-BOTTOM ============
    // Shared values for tracking scroll position and content overflow
    const underflow = useSharedValue(true);
    const atLatest = useSharedValue(true);

    const STICK = 24;
    const LEAVE = 40;
    const EPS = 1;

    // Scroll tracking with Reanimated to determine if user is at bottom
    const handleScroll = useAnimatedScrollHandler({
      onScroll: e => {
        const y = e.contentOffset.y;
        const Hc = e.contentSize?.height ?? 0; // content height
        const Hv = e.layoutMeasurement?.height ?? 0; // viewport height
        const maxY = Math.max(0, Hc - Hv);

        // underflow: content can't actually scroll (flexGrow:1 makes Hc≈Hv)
        underflow.value = Hc <= Hv + EPS;

        // clamp to kill rubber-band noise
        const clampedY = Math.min(Math.max(y, 0), maxY);

        if (underflow.value) {
          atLatest.value = true;
          return;
        }
        if (atLatest.value) {
          if (clampedY > LEAVE) atLatest.value = false;
        } else {
          if (clampedY < STICK) atLatest.value = true;
        }
      },
    });

    // Derived value to determine if there's hidden content (user scrolled away from bottom)
    const hasHiddenContent = useDerivedValue(() => {
      return !underflow.value && !atLatest.value ? 1 : 0;
    });

    // Animated style for scroll-to-bottom button visibility
    const scrollToBottomAnimatedStyle = useAnimatedStyle(() => ({
      opacity: withTiming(hasHiddenContent.value, {duration: 160}),
      transform: [{translateY: withTiming(hasHiddenContent.value ? 0 : 8)}],
    }));

    // Scroll to bottom handler
    const scrollToBottom = React.useCallback(() => {
      list.current?.scrollToOffset({
        animated: true,
        offset: 0,
      });
    }, []);

    // ============ MESSAGE PROCESSING & CALCULATIONS ============
    // Calculate chat messages with date headers and user names
    const {chatMessages, gallery} = calculateChatMessages(messages, user, {
      customDateHeaderText,
      dateFormat,
      showUserNames,
      timeFormat,
      showDateHeaders,
    });

    const previousChatMessages = usePrevious(chatMessages);

    // ============ MESSAGE INPUT HANDLERS ============
    const wrappedOnSendPress = React.useCallback(
      async (message: MessageType.PartialText) => {
        if (chatSessionStore.isEditMode) {
          await chatSessionStore.commitEdit();
        }
        onSendPress(message);
        setInputText('');
        if (chatSessionStore.activeSessionId) {
          chatSessionStore.clearDraft(chatSessionStore.activeSessionId);
        }
        Keyboard.dismiss();
      },
      [onSendPress],
    );

    const handleCancelEdit = React.useCallback(() => {
      setInputText('');
      setInputImages([]);
      chatSessionStore.exitEditMode();
    }, []);

    const {handleCopy, handleEdit, handleTryAgain, handleTryAgainWith} =
      useMessageActions({
        user,
        messages,
        handleSendPress: wrappedOnSendPress,
        setInputText,
        setInputImages,
      });

    // ============ AUTO-SCROLL ON NEW USER MESSAGE ============
    // Scroll to bottom when user sends a new message
    React.useEffect(() => {
      if (
        chatMessages[0]?.type !== 'dateHeader' &&
        chatMessages[0]?.id !== previousChatMessages?.[0]?.id &&
        chatMessages[0]?.author?.id === user.id
      ) {
        list.current?.scrollToOffset({
          animated: true,
          offset: 0,
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatMessages]);

    // ============ LAYOUT ANIMATION SETUP ============
    // Untestable
    /* istanbul ignore next */
    if (animationRef.current && enableAnimation) {
      InteractionManager.runAfterInteractions(animate);
    }

    React.useEffect(() => {
      // Untestable
      /* istanbul ignore next */
      if (animationRef.current && enableAnimation) {
        InteractionManager.runAfterInteractions(animate);
      } else {
        animationRef.current = true;
      }
    }, [enableAnimation, messages]);

    // ============ PAGINATION HANDLER ============
    const handleEndReached = React.useCallback(
      // Ignoring because `scroll` event for some reason doesn't trigger even basic
      // `onEndReached`, impossible to test.
      // TODO: Verify again later
      /* istanbul ignore next */
      async ({distanceFromEnd}: {distanceFromEnd: number}) => {
        if (
          !onEndReached ||
          isLastPage ||
          distanceFromEnd <= 0 ||
          messages.length === 0 ||
          isNextPageLoading
        ) {
          return;
        }

        setNextPageLoading(true);
        await onEndReached?.();
        setNextPageLoading(false);
      },
      [isLastPage, isNextPageLoading, messages.length, onEndReached],
    );

    // ============ IMAGE VIEWER HANDLERS ============
    const handleImagePress = React.useCallback(
      (message: MessageType.Image) => {
        setImageViewIndex(
          gallery.findIndex(
            image => image.id === message.id && image.uri === message.uri,
          ),
        );
        setIsImageViewVisible(true);
        setStackEntry(
          StatusBar.pushStackEntry({
            barStyle: 'light-content',
            animated: true,
          }),
        );
      },
      [gallery],
    );

    // TODO: Tapping on a close button results in the next warning:
    // `An update to ImageViewing inside a test was not wrapped in act(...).`
    /* istanbul ignore next */
    const handleRequestClose = () => {
      setIsImageViewVisible(false);
      StatusBar.popStackEntry(stackEntry);
    };

    // ============ MESSAGE INTERACTION HANDLERS ============
    const handleMessagePress = React.useCallback(
      (message: MessageType.Any) => {
        if (message.type === 'image' && !disableImageGallery) {
          handleImagePress(message);
        }
        onMessagePress?.(message);
      },
      [disableImageGallery, handleImagePress, onMessagePress],
    );

    const handleMessageLongPress = React.useCallback(
      (message: MessageType.Any, event: any) => {
        if (message.type !== 'text' && message.type !== 'assistant_turn') {
          externalOnMessageLongPress?.(message);
          return;
        }

        const {pageX, pageY} = event.nativeEvent;
        setMenuPosition({x: pageX, y: pageY});
        setSelectedMessage(message);
        setMenuVisible(true);
        externalOnMessageLongPress?.(message);
      },
      [externalOnMessageLongPress],
    );

    const handleMenuDismiss = React.useCallback(() => {
      setMenuVisible(false);
      setSelectedMessage(null);
    }, []);

    const keyExtractor = React.useCallback(
      ({id}: MessageType.DerivedAny) => id,
      [],
    );

    // ============ CONTEXT MENU CONFIGURATION ============
    const {
      copy: copyLabel,
      regenerate: regenerateLabel,
      regenerateWith: regenerateWithLabel,
      edit: editLabel,
      reportContent: reportContentLabel,
    } = l10n.components.chatView.menuItems;

    const menuItems = React.useMemo((): MenuItem[] => {
      if (
        !selectedMessage ||
        (selectedMessage.type !== 'text' &&
          selectedMessage.type !== 'assistant_turn')
      ) {
        return [];
      }

      const isAuthor = selectedMessage.author.id === user.id;
      const hasActiveModel = modelStore.activeModelId !== undefined;
      const models = modelStore.availableModels || [];

      const baseItems: MenuItem[] = [
        {
          label: copyLabel,
          onPress: () => {
            handleCopy(selectedMessage);
            handleMenuDismiss();
          },
          icon: () => <CopyIcon stroke={theme.colors.primary} />,
          disabled: false,
        },
      ];

      if (!isAuthor) {
        baseItems.push({
          label: regenerateLabel,
          onPress: () => {
            handleTryAgain(selectedMessage);
            handleMenuDismiss();
          },
          icon: () => <RefreshIcon stroke={theme.colors.primary} />,
          disabled: !hasActiveModel,
        });

        baseItems.push({
          label: regenerateWithLabel,
          icon: () => <GridIcon stroke={theme.colors.primary} />,
          disabled: false,
          submenu: models.map(model => ({
            label: model.name,
            width: Math.min(300, size.width),
            onPress: () => {
              handleTryAgainWith(model.id, selectedMessage);
              handleMenuDismiss();
            },
          })),
        });
      }

      if (isAuthor) {
        baseItems.push({
          label: editLabel,
          onPress: () => {
            handleEdit(selectedMessage);
            handleMenuDismiss();
          },
          icon: () => <PencilLineIcon stroke={theme.colors.primary} />,
          disabled: !hasActiveModel,
        });
      }

      baseItems.push({
        label: reportContentLabel,
        onPress: () => {
          setIsReportSheetVisible(true);
          handleMenuDismiss();
        },
        icon: () => <AlertIcon stroke={theme.colors.primary} />,
        disabled: false,
      });

      return baseItems;
    }, [
      selectedMessage,
      user.id,
      handleCopy,
      handleTryAgain,
      handleTryAgainWith,
      handleEdit,
      handleMenuDismiss,
      size.width,
      theme.colors.primary,
      copyLabel,
      regenerateLabel,
      regenerateWithLabel,
      editLabel,
      reportContentLabel,
    ]);

    // ============ RENDER FUNCTIONS ============
    // Render menu item (with submenu support)
    const renderMenuItem = React.useCallback(
      (item: MenuItem, index: number) => {
        if (item.submenu) {
          return (
            <React.Fragment key={index}>
              <Menu.Item
                label={item.label}
                leadingIcon={item.icon}
                disabled={item.disabled}
                submenu={item.submenu.map(
                  (subItem: SubMenuItem, subIndex: number) => (
                    <React.Fragment key={subIndex}>
                      <Menu.Item
                        key={subIndex}
                        label={subItem.label}
                        onPress={subItem.onPress}
                        disabled={subItem.disabled}
                      />
                    </React.Fragment>
                  ),
                )}
              />
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={index}>
            <Menu.Item
              label={item.label}
              onPress={item.onPress}
              leadingIcon={item.icon}
              disabled={item.disabled}
            />
          </React.Fragment>
        );
      },
      [],
    );

    // Active-vs-persisted predicate (single source of truth). A message
    // is "active" if it is the LAST (newest) message in the input
    // `messages` list AND the agent's UI status is in the actively-
    // running set. Computed once here and passed down via props so
    // individual blocks within an AssistantTurn don't re-derive it.
    const newestMessageId = messages.length > 0 ? messages[0].id : null;
    const agentStatus = chatSessionStore.agentUiState.status;
    const isAgentActive =
      agentStatus === 'prefill' ||
      agentStatus === 'streaming_text' ||
      agentStatus === 'generating_tool_call' ||
      agentStatus === 'executing_tool';
    // The PendingIndicator covers every dead zone: prefill (initial
    // and follow-up), generating_tool_call, executing_tool. Hidden in
    // streaming_text and done so it doesn't compete with the visible
    // token stream / final footer.
    const isPending =
      agentStatus === 'prefill' ||
      agentStatus === 'generating_tool_call' ||
      agentStatus === 'executing_tool' ||
      // Keep the indicator visible during the user-initiated stop
      // window so they see the "Stopping…" feedback even if status
      // had been `streaming_text` (no indicator) at the moment of the
      // tap. Cleared together with `isStopping` once the runner exits.
      chatSessionStore.isStopping;
    const activeRunPendingTalentNames =
      chatSessionStore.agentUiState.pendingTalentNames;
    const isGeneratingToolCall = agentStatus === 'generating_tool_call';

    // Render individual message
    const renderMessage = React.useCallback(
      ({item: message}: {item: MessageType.DerivedAny; index: number}) => {
        const messageWidth =
          showUserAvatars &&
          message.type !== 'dateHeader' &&
          message.author?.id !== user.id
            ? Math.floor(Math.min(size.width * 0.9, 900))
            : Math.floor(Math.min(size.width * 0.92, 900));

        const roundBorder =
          message.type !== 'dateHeader' && message.nextMessageInGroup;
        const showAvatar =
          message.type !== 'dateHeader' && !message.nextMessageInGroup;
        const showName = message.type !== 'dateHeader' && message.showName;
        const showStatus = message.type !== 'dateHeader' && message.showStatus;

        const isActiveRun =
          isAgentActive &&
          message.type !== 'dateHeader' &&
          message.id === newestMessageId;

        return (
          <View>
            <Message
              {...{
                enableAnimation,
                isActiveRun,
                activeRunPendingTalentNames: isActiveRun
                  ? activeRunPendingTalentNames
                  : undefined,
                isGeneratingToolCall: isActiveRun
                  ? isGeneratingToolCall
                  : false,
                message,
                messageWidth,
                onMessageLongPress: handleMessageLongPress,
                onMessagePress: handleMessagePress,
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
              }}
            />
          </View>
        );
      },
      [
        enableAnimation,
        handleMessageLongPress,
        handleMessagePress,
        onPreviewDataFetched,
        renderBubble,
        renderCustomMessage,
        renderFileMessage,
        renderImageMessage,
        renderTextMessage,
        showUserAvatars,
        size.width,
        usePreviewData,
        user.id,
        isAgentActive,
        newestMessageId,
        activeRunPendingTalentNames,
        isGeneratingToolCall,
      ],
    );

    // Render empty state (video pal or regular chat placeholder)
    const renderListEmptyComponent = React.useCallback(() => {
      // Show VideoPalEmptyPlaceholder for video pal, otherwise show regular ChatEmptyPlaceholder
      if (activePal && hasVideoCapability(activePal)) {
        return (
          <VideoPalEmptyPlaceholder
            bottomComponentHeight={bottomComponentHeight}
          />
        );
      }

      return (
        <>
          {activePal?.greeting?.text && modelStore.activeModelId ? (
            <GreetingBubble text={activePal.greeting.text} />
          ) : null}
          <ChatEmptyPlaceholder
            bottomComponentHeight={bottomComponentHeight}
            onSelectModel={() => setIsPickerVisible(true)}
          />
        </>
      );
    }, [bottomComponentHeight, setIsPickerVisible, activePal]);

    // Render footer (loading indicator or spacer)
    const renderListFooterComponent = React.useCallback(
      () =>
        // Impossible to test, see `handleEndReached` function
        /* istanbul ignore next */
        isNextPageLoading ? (
          <View style={styles.footerLoadingPage}>
            <CircularActivityIndicator color={theme.colors.primary} size={16} />
          </View>
        ) : (
          <View style={styles.footer} />
        ),
      [
        isNextPageLoading,
        styles.footerLoadingPage,
        styles.footer,
        theme.colors.primary,
      ],
    );

    // ListHeaderComponent as animated spacer (inverted list: header is at bottom)
    // We use this to create a spacer at the bottom of the list to account for the keyboard height.
    // So we can move up/down when the keyboard is shown/hidden.
    const headerStyle = useAnimatedStyle(() => {
      // only animate when not streaming
      // if (isStreaming) return {height: 0};

      // Only lift when keyboard is actively moving
      const shouldLift = trackingKeyboardMovement.value;
      return {
        height: shouldLift
          ? Math.abs(keyboard.height.value) - insets.bottom
          : 0,
      };
    });

    // Render header (pending indicator + keyboard spacer). The
    // FlatList is `inverted={true}`, so the ListHeaderComponent renders
    // at the bottom of the visible list — i.e. BELOW the latest turn,
    // never inside it.
    const renderListHeaderComponent = React.useCallback(
      () => (
        <>
          {isPending && <PendingIndicatorView />}
          {chatMessages.length > 0 && <Reanimated.View style={headerStyle} />}
        </>
      ),
      [isPending, chatMessages.length, headerStyle],
    );

    // Render complete chat list with scroll-to-bottom button
    const renderChatList = React.useCallback(
      () => (
        <>
          <Reanimated.View
            // eslint-disable-next-line react-native/no-inline-styles
            style={{flex: 1}}>
            <Reanimated.FlatList
              automaticallyAdjustContentInsets={false}
              contentContainerStyle={[
                styles.flatListContentContainer,
                // eslint-disable-next-line react-native/no-inline-styles
                {
                  justifyContent:
                    chatMessages.length !== 0 ? undefined : 'center',
                },
              ]}
              initialNumToRender={10}
              ListEmptyComponent={renderListEmptyComponent}
              ListFooterComponent={renderListFooterComponent}
              ListHeaderComponent={renderListHeaderComponent}
              maxToRenderPerBatch={6}
              onEndReachedThreshold={0.75}
              style={[styles.flatList, {marginBottom: bottomComponentHeight}]}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              {...unwrap(flatListProps)}
              data={chatMessages}
              inverted={chatMessages.length > 0}
              keyboardDismissMode="interactive"
              keyExtractor={keyExtractor}
              onEndReached={handleEndReached}
              ref={list}
              renderItem={renderMessage}
              maintainVisibleContentPosition={
                isStreaming // || hasHiddenContentState
                  ? {
                      autoscrollToTopThreshold: 20,
                      minIndexForVisible: 1, //isStreaming ? 1 : 0,
                    }
                  : undefined
              }
            />
          </Reanimated.View>
          <Reanimated.View
            style={[
              scrollToBottomAnimatedStyle,
              // eslint-disable-next-line react-native/no-inline-styles
              {
                // position: 'absolute',
                right: 8,
                bottom:
                  bottomComponentHeight +
                  40 /* button height */ +
                  20 /* padding */,
              },
            ]}>
            <KeyboardStickyView offset={{closed: 0, opened: insets.bottom}}>
              <TouchableOpacity
                style={styles.scrollToBottomButton}
                onPress={scrollToBottom}>
                <Icon
                  name="chevron-down"
                  size={20}
                  color={theme.colors.onPrimary}
                />
              </TouchableOpacity>
            </KeyboardStickyView>
          </Reanimated.View>
        </>
      ),
      [
        styles.flatListContentContainer,
        styles.flatList,
        styles.scrollToBottomButton,
        chatMessages,
        renderListEmptyComponent,
        renderListFooterComponent,
        renderListHeaderComponent,
        bottomComponentHeight,
        handleScroll,
        flatListProps,
        keyExtractor,
        handleEndReached,
        renderMessage,
        isStreaming,
        scrollToBottomAnimatedStyle,
        insets.bottom,
        scrollToBottom,
        theme.colors.onPrimary,
      ],
    );

    // ============ PAL/MODEL PICKER HANDLERS ============
    const handleModelSelect = React.useCallback((model: string) => {
      setSelectedModel(model);
      setIsPickerVisible(false);
    }, []);

    const handlePalSelect = React.useCallback((pal: string | undefined) => {
      setSelectedPal(pal);
      setIsPickerVisible(false);
    }, []);

    // ============ COMPUTED VALUES ============
    const inputBackgroundColor = activePal?.color?.[1]
      ? activePal.color?.[1]
      : theme.colors.surface;

    // Soft cap: warn the user before the 5th HTML preview in this session.
    // Memory pressure on budget Android becomes a hazard above 5 WebViews;
    // we surface the banner non-blockingly at >=4 so they can start a new
    // chat. Counts html-result outcomes across all steps of every
    // AssistantTurn row in the visible message list.
    const htmlPreviewCount = React.useMemo(
      () =>
        messages.reduce((acc, m) => {
          if (m.type !== 'assistant_turn') {
            return acc;
          }
          const turn = m as MessageType.AssistantTurn;
          let count = 0;
          for (const step of turn.steps ?? []) {
            for (const outcome of step.toolOutcomes ?? []) {
              if (outcome.result.type === 'html') {
                count += 1;
              }
            }
          }
          return acc + count;
        }, 0),
      [messages],
    );

    // ============ CONTEXT BANNER STATE ============
    const snap = chatSessionStore.lastCompletionResult;
    const dismissedKeys = chatSessionStore.dismissedBannerVariants;
    const consecutiveFullFailures = chatSessionStore.consecutiveFullFailures;
    const activeSessionId = chatSessionStore.activeSessionId;
    const sessionOverrides = chatSessionStore.sessionContextOverrides;
    const activeModel = modelStore.activeModel;
    const baseNCtx = modelStore.contextInitParams.n_ctx;
    const effectiveNCtxForSession = effectiveNCtx(
      sessionOverrides,
      activeSessionId,
      baseNCtx,
    );
    const isRemoteSession = activeModel?.origin === ModelOrigin.REMOTE;
    const isRunActive =
      chatSessionStore.isGenerating || chatSessionStore.isStopping;

    const [nextTierTokens, setNextTierTokens] = React.useState<number | null>(
      null,
    );
    React.useEffect(() => {
      let cancelled = false;
      if (!activeModel || isRemoteSession) {
        setNextTierTokens(null);
        return () => {
          cancelled = true;
        };
      }
      pickNextTier(effectiveNCtxForSession, n =>
        hasEnoughMemoryWithNCtx(activeModel, n),
      )
        .then(tier => {
          if (!cancelled) {
            setNextTierTokens(tier);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNextTierTokens(null);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [activeModel, isRemoteSession, effectiveNCtxForSession]);

    const lastAssistantMsg = React.useMemo(
      () =>
        messages.find(m => m.type === 'assistant_turn' || m.type === 'text') as
          | MessageType.Any
          | undefined,
      [messages],
    );
    const lastAssistantText = lastAssistantMsg
      ? derivedText(lastAssistantMsg)
      : '';
    const lastAssistantTurn =
      lastAssistantMsg?.type === 'assistant_turn'
        ? (lastAssistantMsg as MessageType.AssistantTurn)
        : undefined;

    const bannerVariant: BannerVariant = React.useMemo(
      () =>
        resolveBannerVariant({
          snapshot: snap,
          effectiveNCtx: effectiveNCtxForSession,
          isRemote: !!isRemoteSession,
          htmlPreviewCount,
          consecutiveFullFailures,
          dismissedKeys,
          sessionId: activeSessionId,
          nextTierTokens,
          lastAssistantText,
          lastAssistantTurn,
        }),
      [
        snap,
        effectiveNCtxForSession,
        isRemoteSession,
        htmlPreviewCount,
        consecutiveFullFailures,
        dismissedKeys,
        activeSessionId,
        nextTierTokens,
        lastAssistantText,
        lastAssistantTurn,
      ],
    );

    // ============ INCREASE CONTEXT CTA ============
    const [increaseSheetVisible, setIncreaseSheetVisible] =
      React.useState(false);
    const [isReloading, setIsReloading] = React.useState(false);
    const [reloadSnackbar, setReloadSnackbar] = React.useState<{
      message: string;
      visible: boolean;
      duration?: number;
    } | null>(null);

    const handleDismissBanner = React.useCallback(
      (kind: BannerVariant['kind']) => {
        if (!activeSessionId) {
          return;
        }
        chatSessionStore.setBannerDismissed(activeSessionId, kind);
      },
      [activeSessionId],
    );

    const handleConfirmIncrease = React.useCallback(async () => {
      if (!activeSessionId || !activeModel || nextTierTokens === null) {
        return;
      }
      const target = nextTierTokens;
      const priorOverride = sessionOverrides.get(activeSessionId);
      chatSessionStore.setSessionContextOverride(activeSessionId, target);
      setIsReloading(true);
      setReloadSnackbar({
        message: l10n.chat.contextWarning.reloadingSubcopy,
        visible: true,
        // Stay visible until success / failure dismisses it explicitly.
        duration: Number.MAX_SAFE_INTEGER,
      });
      setIncreaseSheetVisible(false);
      try {
        await modelStore.releaseContext();
        await modelStore.initContext(activeModel);
        setReloadSnackbar({
          message: l10n.chat.contextWarning.sheet.successSnackbar,
          visible: true,
        });
      } catch (err) {
        if (priorOverride === undefined) {
          chatSessionStore.clearSessionContextOverride(activeSessionId);
        } else {
          chatSessionStore.setSessionContextOverride(
            activeSessionId,
            priorOverride,
          );
        }
        console.warn('[ChatView] increase context failed:', err);
        setReloadSnackbar({
          message: l10n.chat.contextWarning.sheet.failureSnackbar,
          visible: true,
        });
      } finally {
        setIsReloading(false);
      }
    }, [activeSessionId, activeModel, nextTierTokens, sessionOverrides, l10n]);

    const handleNewChat = React.useCallback(() => {
      chatSessionStore.resetActiveSession();
    }, []);

    // Pal-load hint snackbar (one-shot per (palId, n_ctx) per session).
    // Snackbar lives on a separate surface from the banner so I4
    // (exactly one banner) is preserved.
    const palLoadHint = usePalLoadHint(activePal);
    const handlePalLoadHintAction = React.useCallback(async () => {
      const action = await palLoadHint.onAction();
      if (action === 'increase') {
        setIncreaseSheetVisible(true);
      } else if (action === 'newChat') {
        chatSessionStore.resetActiveSession();
      }
    }, [palLoadHint]);

    // ============ COMPONENT RENDER ============
    return (
      <UserContext.Provider value={user}>
        <View
          style={[styles.container, {backgroundColor: inputBackgroundColor}]}
          onLayout={onLayout}>
          {/* Header */}
          <View style={styles.headerWrapper}>
            <ChatHeader />
          </View>

          {/* Main chat container */}
          <Reanimated.View style={styles.chatContainer}>
            {customContent}
            {renderChatList()}

            {/* Chat input */}
            <Reanimated.View
              onLayout={onLayoutChatInput}
              style={[
                styles.inputContainer,
                inputContainerAnimatedStyle,
                {backgroundColor: inputBackgroundColor},
              ]}>
              {bannerVariant.kind !== 'none' ? (
                <BannerRow
                  variant={bannerVariant}
                  l10n={l10n}
                  isRunActive={isRunActive}
                  onIncrease={() => setIncreaseSheetVisible(true)}
                  onDismiss={handleDismissBanner}
                  onNewChat={handleNewChat}
                  styles={styles}
                />
              ) : null}
              <ChatInput
                {...{
                  ...unwrap(inputProps),
                  isStreaming,
                  onSendPress: wrappedOnSendPress,
                  onStopPress,
                  chatInputHeight,
                  inputBackgroundColor,
                  onCancelEdit: handleCancelEdit,
                  onPalBtnPress: () => setIsPickerVisible(!isPickerVisible),
                  isStopVisible,
                  isPickerVisible,
                  sendButtonVisibilityMode,
                  showImageUpload,
                  isVisionEnabled,
                  defaultImages: inputImages,
                  onDefaultImagesChange: setInputImages,
                  textInputProps: {
                    ...textInputProps,
                    // Only override value and onChangeText if not using promptText
                    ...(!(activePal && hasVideoCapability(activePal)) && {
                      value: inputText,
                      onChangeText: setInputText,
                    }),
                  },
                }}
              />
            </Reanimated.View>

            {/* Suggested prompts — float above the input container, share
                its keyboard-tracking transform so they rise together but
                render as a sibling (no shared background / rounded top). */}
            {messages.length === 0 &&
            !isStreaming &&
            modelStore.activeModelId !== undefined &&
            activePal?.greeting?.suggestedPrompts &&
            activePal.greeting.suggestedPrompts.length > 0 ? (
              <Reanimated.View
                pointerEvents="box-none"
                style={[
                  styles.suggestedPromptsOverlay,
                  suggestedPromptsAnimatedStyle,
                  {bottom: chatInputHeight.height},
                ]}>
                <SuggestedPromptsRow
                  prompts={activePal.greeting.suggestedPrompts}
                  onSelect={prompt =>
                    wrappedOnSendPress({type: 'text', text: prompt})
                  }
                />
              </Reanimated.View>
            ) : null}

            {/* Pal/Model picker sheet */}
            {/* Conditionally render the sheet to avoid keyboard issues.
            It makes the disappearing sudden, but it's better than the keyboard issue.*/}
            {isPickerVisible && (
              <ChatPalModelPickerSheet
                isVisible={isPickerVisible}
                onClose={() => setIsPickerVisible(false)}
                onModelSelect={handleModelSelect}
                onPalSelect={handlePalSelect}
                onPalSettingsSelect={onPalSettingsSelect}
                chatInputHeight={chatInputHeight.height}
              />
            )}
          </Reanimated.View>

          {/* Image viewer */}
          <ImageView
            imageIndex={imageViewIndex}
            images={gallery}
            onRequestClose={handleRequestClose}
            visible={isImageViewVisible}
          />

          {/* Context menu */}
          <Menu
            visible={menuVisible}
            onDismiss={handleMenuDismiss}
            selectable={false}
            anchor={menuPosition}>
            {menuItems.map(renderMenuItem)}
          </Menu>

          {/* Content report sheet */}
          <ContentReportSheet
            isVisible={isReportSheetVisible}
            onClose={() => setIsReportSheetVisible(false)}
          />

          {/* Increase-context sheet (banner CTA) */}
          {activeModel && nextTierTokens !== null ? (
            <IncreaseContextSheet
              isVisible={increaseSheetVisible}
              onClose={() => setIncreaseSheetVisible(false)}
              onConfirm={handleConfirmIncrease}
              currentNCtx={effectiveNCtxForSession}
              nextTierTokens={nextTierTokens}
              isReloading={isReloading}
            />
          ) : null}

          {/* Reload / success / failure snackbar */}
          {reloadSnackbar !== null ? (
            <Portal>
              <Snackbar
                visible={reloadSnackbar.visible}
                onDismiss={() =>
                  setReloadSnackbar(prev =>
                    prev ? {...prev, visible: false} : null,
                  )
                }
                duration={reloadSnackbar.duration ?? 4000}
                testID="increase-context-snackbar">
                {reloadSnackbar.message}
              </Snackbar>
            </Portal>
          ) : null}

          {/* One-shot pal-load hint */}
          {palLoadHint.state !== null ? (
            <Portal>
              <Snackbar
                visible={palLoadHint.state.visible}
                onDismiss={palLoadHint.dismiss}
                duration={8000}
                action={{
                  label: palLoadHint.state.actionLabel,
                  onPress: handlePalLoadHintAction,
                }}
                testID="pal-load-hint-snackbar">
                {palLoadHint.state.message}
              </Snackbar>
            </Portal>
          ) : null}
        </View>
      </UserContext.Provider>
    );
  },
);

interface BannerRowProps {
  variant: BannerVariant;
  l10n: ReturnType<typeof React.useContext> & any;
  isRunActive: boolean;
  onIncrease: () => void;
  onDismiss: (kind: BannerVariant['kind']) => void;
  onNewChat: () => void;
  styles: ReturnType<typeof createStyles>;
}

/**
 * Inline banner row that renders one of the four visible variants
 * resolved by `resolveBannerVariant`. The shell (chrome, padding,
 * background) is shared via `softCapBanner` styles; only the inner
 * content changes per variant.
 */
const BannerRow: React.FC<BannerRowProps> = ({
  variant,
  l10n,
  isRunActive,
  onIncrease,
  onDismiss,
  onNewChat,
  styles,
}) => {
  const copy = l10n.chat.contextWarning;

  if (variant.kind === 'html-soft-cap') {
    return (
      <View testID="soft-cap-warning" style={styles.softCapBanner}>
        <Text style={styles.softCapBannerText}>{l10n.chat.softCapWarning}</Text>
        <View style={styles.bannerActions}>
          <PaperButton
            mode="text"
            compact
            onPress={() => onDismiss('html-soft-cap')}>
            {copy.warning.dismiss}
          </PaperButton>
        </View>
      </View>
    );
  }

  if (variant.kind === 'context-warning') {
    return (
      <View testID="context-warning-banner" style={styles.softCapBanner}>
        <Text style={styles.bannerTitle}>{copy.warning.title}</Text>
        <Text style={styles.softCapBannerText}>{copy.warning.message}</Text>
        <View style={styles.bannerActions}>
          {variant.nextTierTokens !== null ? (
            <PaperButton
              mode="text"
              compact
              disabled={isRunActive}
              onPress={onIncrease}>
              {copy.warning.increase}
            </PaperButton>
          ) : null}
          <PaperButton
            mode="text"
            compact
            onPress={() => onDismiss('context-warning')}>
            {copy.warning.dismiss}
          </PaperButton>
        </View>
      </View>
    );
  }

  if (variant.kind === 'context-full') {
    const titleCopy = variant.escalated
      ? copy.fullEscalated.title
      : variant.heavyTalent
        ? copy.fullHeavyTalent.title
        : copy.full.title;
    const messageCopy = variant.escalated
      ? copy.fullEscalated.message
      : variant.heavyTalent
        ? t(copy.fullHeavyTalent.message, {
            talentName: variant.heavyTalent.name,
          })
        : copy.full.message;
    return (
      <View testID="context-full-banner" style={styles.softCapBanner}>
        <Text style={styles.bannerTitle}>{titleCopy}</Text>
        <Text style={styles.softCapBannerText}>{messageCopy}</Text>
        <View style={styles.bannerActions}>
          {variant.nextTierTokens !== null ? (
            <PaperButton
              mode="text"
              compact
              disabled={isRunActive}
              onPress={onIncrease}>
              {copy.full.increase}
            </PaperButton>
          ) : null}
          <PaperButton mode="text" compact onPress={onNewChat}>
            {copy.full.newChat}
          </PaperButton>
        </View>
      </View>
    );
  }

  // context-remote-hedged
  return (
    <View testID="context-remote-hedged-banner" style={styles.softCapBanner}>
      <Text style={styles.bannerTitle}>{copy.remoteHedged.title}</Text>
      <Text style={styles.softCapBannerText}>{copy.remoteHedged.message}</Text>
      <View style={styles.bannerActions}>
        <PaperButton
          mode="text"
          compact
          onPress={() => onDismiss('context-remote-hedged')}>
          {copy.remoteHedged.dismiss}
        </PaperButton>
      </View>
    </View>
  );
};
