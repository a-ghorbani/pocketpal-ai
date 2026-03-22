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
} from 'react-native';

import dayjs from 'dayjs';
import {observer} from 'mobx-react';
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
  runOnJS,
} from 'react-native-reanimated';

import {useComponentSize} from '../KeyboardAccessoryView/hooks';

import {
  useTheme,
  useMessageActions,
  usePrevious,
  estimateChatContextUsage,
} from '../../hooks';

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
import {chatNavLog} from '../../utils/debug';
import {resolveSystemMessages} from '../../utils/systemPromptResolver';
import {convertToChatMessages} from '../../utils/chat';

import {
  Message,
  MessageTopLevelProps,
  CircularActivityIndicator,
  ChatInput,
  ChatInputAdditionalProps,
  ChatInputTopLevelProps,
  Menu,
  LoadingBubble,
  ChatPalModelPickerSheet,
  ChatHeader,
  ChatEmptyPlaceholder,
  VideoPalEmptyPlaceholder,
  ContentReportSheet,
} from '..';
import {ChatNavigationBar, UserMessageNode} from '../ChatNavigationBar';
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
  /** Indicates if the AI is currently streaming tokens */
  isStreaming?: boolean;
  /** Indicates if the AI is currently thinking (processing but not yet streaming) */
  isThinking?: boolean;
  /** Real prompt processing progress percentage reported by the engine */
  promptProcessingProgress?: number | null;
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
    isThinking = false,
    promptProcessingProgress = null,
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
    // Measured heights per FlatList index for accurate nav-bar node positioning
    const itemHeightsRef = React.useRef(new Map<number, number>());

    // ============ COMPONENT STATE ============
    // Input state
    const [inputText, setInputText] = React.useState('');
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

    // ============ ACTIVE PAL MODEL INITIALIZATION ============
    // Initialize model context when active pal changes
    React.useEffect(() => {
      if (activePal) {
        if (!modelStore.activeModel && activePal.defaultModel) {
          const palDefaultModel = modelStore.availableModels.find(
            m => m.id === activePal.defaultModel?.id,
          );

          if (palDefaultModel) {
            // Initialize the model context
            modelStore.initContext(palDefaultModel);
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

    // ============ CHAT NAVIGATION BAR STATE ============
    // JS-thread state for navigation bar (doesn't need 60fps)
    const [navScrollY, setNavScrollY] = React.useState(0);
    const [navContentHeight, setNavContentHeight] = React.useState(0);
    const [navViewportHeight, setNavViewportHeight] = React.useState(0);
    // Cached viewport height from FlatList onLayout (available before first scroll)
    const flatListViewportH = React.useRef(0);

    // Approximate pixel height for "1000 visual lines" (~20px per line)
    const MAX_WINDOW_PX = 20000;

    // Throttle nav state updates to avoid excessive re-renders.
    // Uses a "trailing" throttle: always stores the latest values in a ref,
    // and the timer fires with whatever is newest — no stale closures.
    const navUpdateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const navLatestValues = React.useRef({
      scrollY: 0,
      contentH: 0,
      viewportH: 0,
    });

    // updateNavState: stable function for runOnJS in the scroll handler worklet.
    // Uses a ref so the worklet always has a valid __remoteFunction binding,
    // even across re-renders triggered by MobX observer.
    const updateNavStateImpl = React.useCallback(
      (scrollY: number, contentH: number, viewportH: number) => {
        // Always store the latest values
        navLatestValues.current.scrollY = scrollY;
        navLatestValues.current.contentH = contentH;
        navLatestValues.current.viewportH = viewportH;

        if (navUpdateTimer.current) {
          return; // Timer already pending — it will read the latest ref values
        }
        navUpdateTimer.current = setTimeout(() => {
          navUpdateTimer.current = null;
          const latest = navLatestValues.current;
          setNavScrollY(latest.scrollY);
          setNavContentHeight(latest.contentH);
          setNavViewportHeight(latest.viewportH);
        }, 32);
      },
      [],
    );
    const updateNavStateRef = React.useRef(updateNavStateImpl);
    updateNavStateRef.current = updateNavStateImpl;
    const updateNavState = React.useCallback(
      (scrollY: number, contentH: number, viewportH: number) => {
        updateNavStateRef.current(scrollY, contentH, viewportH);
      },
      [],
    );

    // ============ SCROLL TRACKING & SCROLL-TO-BOTTOM ============
    // Shared values for tracking scroll position and content overflow
    const underflow = useSharedValue(true);
    const atLatest = useSharedValue(true);

    // Guard to prevent runOnJS calls after unmount
    const isMounted = useSharedValue(true);
    React.useEffect(() => {
      isMounted.value = true;
      return () => {
        isMounted.value = false;
        if (navUpdateTimer.current) {
          clearTimeout(navUpdateTimer.current);
          navUpdateTimer.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

        // Update navigation bar state (throttled on JS thread)
        if (isMounted.value) {
          runOnJS(updateNavState)(clampedY, Hc, Hv);
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

    // Fallback auto-scroll: when MVCP fails to keep up during fast streaming,
    // actively snap to bottom if user was already at the bottom.
    const handleContentSizeChange = React.useCallback(
      (_w: number, h: number) => {
        if (isStreaming && atLatest.value) {
          list.current?.scrollToOffset({offset: 0, animated: false});
        }
        // Seed nav bar state so the progress indicator is correct even
        // before the user scrolls (e.g. opening an old conversation).
        const vpH = flatListViewportH.current;
        if (vpH > 0 && h > 0) {
          updateNavState(0, h, vpH);
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isStreaming, updateNavState],
    );

    const handleFlatListLayout = React.useCallback(
      (e: {nativeEvent: {layout: {height: number}}}) => {
        flatListViewportH.current = e.nativeEvent.layout.height;
      },
      [],
    );

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

    // Clear cached item heights when the message list changes length
    // (new messages shift indices in the inverted list)
    React.useEffect(() => {
      itemHeightsRef.current.clear();
    }, [chatMessages.length]);

    // ============ CHAT NAVIGATION BAR COMPUTATIONS ============
    // Find indices of user messages in chatMessages (inverted list: index 0 = newest)
    const userMessageIndices = React.useMemo(() => {
      const indices: number[] = [];
      chatMessages.forEach((msg, i) => {
        if (msg.type !== 'dateHeader' && msg.author?.id === user.id) {
          indices.push(i);
        }
      });
      return indices;
    }, [chatMessages, user.id]);

    // Build cumulative height array from measured item heights.
    // cumH[i] = pixel offset from bottom to the top edge of item i.
    // Reused by navBarProps and navigation handlers.
    const buildCumulativeHeights = React.useCallback(() => {
      const len = chatMessages.length;
      const heights = itemHeightsRef.current;

      // 1. 基于已测量到的真实消息，计算一个更靠谱的平均高度
      let measuredSum = 0;
      let measuredCount = 0;
      for (let i = 0; i < len; i++) {
        const h = heights.get(i);
        if (h !== undefined) {
          measuredSum += h;
          measuredCount++;
        }
      }
      // 如果还没渲染出任何内容，给一个合理的默认高度（比如 80px）
      const avgH = measuredCount > 0 ? measuredSum / measuredCount : 80;

      // 2. 依次累加高度，保留真实的物理空间
      const cumH = new Float64Array(len + 1);
      for (let i = 0; i < len; i++) {
        cumH[i + 1] = cumH[i] + (heights.get(i) ?? avgH);
      }

      // 3. 彻底干掉原本的 scale 拉伸逻辑！
      // 直接返回真实的累加高度，允许顶部/底部留有真实的 Header/Footer 空隙
      return cumH;
    }, [chatMessages.length]);

    // Compute navigation bar props.
    //
    // Model (full-content mode, totalH ≤ MAX_WINDOW_PX):
    //   Track = entire content (0 = oldest/top, 1 = newest/bottom)
    //   Thumb = current viewport (has height proportional to viewport/content)
    //   Node  = user message position in content
    //   Alignment: thumb TOP touches node marker ↔ message at screen top
    //
    // In inverted FlatList: scrollY=0 → bottom (newest), scrollY grows → top (older)
    // Mapping to track: fraction = 1 − pixelFromBottom / totalH
    //   pixelFromBottom=0 (newest) → fraction=1 (track bottom)
    //   pixelFromBottom=totalH (oldest) → fraction=0 (track top)
    //
    // Thumb top  = 1 − (scrollY + viewportH) / totalH  (top of viewport)
    // Thumb height = viewportH / totalH
    // Node position = 1 − pixelFromBottom / totalH
    const navBarProps = React.useMemo(() => {
      if (
        chatMessages.length === 0 ||
        navContentHeight === 0 ||
        navViewportHeight === 0
      ) {
        return {
          nodes: [] as UserMessageNode[],
          thumbTop: 0,
          thumbHeight: 1,
        };
      }

      const totalH = navContentHeight;

      // Window: track represents at most MAX_WINDOW_PX of content.
      // When content ≤ MAX_WINDOW_PX: window = all content.
      // When content > MAX_WINDOW_PX: sliding window of MAX_WINDOW_PX,
      //   centered on viewport, with edge compensation so it always
      //   covers exactly MAX_WINDOW_PX (e.g. bottom has only 400 lines
      //   → top gets 600 lines).
      let winStart: number;
      const winSize = totalH <= MAX_WINDOW_PX ? totalH : MAX_WINDOW_PX;

      if (totalH <= MAX_WINDOW_PX) {
        winStart = 0;
      } else {
        const vpCenter = navScrollY + navViewportHeight / 2;
        const ideal = vpCenter - MAX_WINDOW_PX / 2;
        winStart = Math.max(0, Math.min(totalH - MAX_WINDOW_PX, ideal));
      }

      // All coordinates map within the window:
      //   fraction(px) = 1 - (px - winStart) / winSize
      //   track top (0) = oldest in window, track bottom (1) = newest
      const vpTop = navScrollY + navViewportHeight;
      const thumbTop = 1 - (vpTop - winStart) / winSize;
      const thumbHeight = navViewportHeight / winSize;

      // Build cumulative heights
      const cumH = buildCumulativeHeights();

      // Node markers within the window
      const nodes: UserMessageNode[] = [];
      const winEnd = winStart + winSize;
      userMessageIndices.forEach(idx => {
        // cumH[idx+1] = top edge of message idx (the "standard position" reference)
        const px = cumH[idx + 1];
        if (px >= winStart && px <= winEnd) {
          const position = 1 - (px - winStart) / winSize;
          nodes.push({index: idx, position});
        }
      });

      return {nodes, thumbTop, thumbHeight};
    }, [
      chatMessages.length,
      navContentHeight,
      navViewportHeight,
      navScrollY,
      userMessageIndices,
      MAX_WINDOW_PX,
      buildCumulativeHeights,
    ]);

    // --- Pointer-based navigation ---
    // Track current position in userMessageIndices array (-1 = uninitialized).
    // userMessageIndices: [newest(idx0), ..., oldest(idxN)]
    // UP = older = higher position in array, DOWN = newer = lower position.
    const navCursorRef = React.useRef(-1);
    // The flatList index we last scrolled to. Used to detect if the user
    // has manually scrolled away (the target is no longer on screen).
    const lastNavTargetRef = React.useRef(-1);

    // Reset cursor when the message list changes (new messages added, etc.)
    React.useEffect(() => {
      navCursorRef.current = -1;
      lastNavTargetRef.current = -1;
    }, [userMessageIndices.length]);

    // Initialize cursor from current scroll position.
    // Finds the position in userMessageIndices of the user message closest to
    // the viewport top (the "standard position" reference point).
    const initNavCursor = React.useCallback(() => {
      if (userMessageIndices.length === 0) {
        return 0;
      }
      const cumH = buildCumulativeHeights();
      const vpTop = navScrollY + navViewportHeight;

      // Build a snapshot of every user message's cumH for logging
      const msgMap = userMessageIndices.map((flatIdx, i) => ({
        pos: i,
        flatIdx,
        cumH: Math.round(cumH[flatIdx + 1]),
      }));

      // Find the last user message whose top edge is at or below vpTop
      // (i.e., visible on screen or below). Messages after this are above viewport.
      let pos = 0;
      for (let i = 0; i < userMessageIndices.length; i++) {
        if (cumH[userMessageIndices[i] + 1] <= vpTop) {
          pos = i;
        } else {
          break;
        }
      }
      chatNavLog('initNavCursor', {
        vpTop: Math.round(vpTop),
        scrollY: Math.round(navScrollY),
        vpH: Math.round(navViewportHeight),
        messages: msgMap,
        result: pos,
      });
      return pos;
    }, [
      userMessageIndices,
      buildCumulativeHeights,
      navScrollY,
      navViewportHeight,
    ]);

    // Skip clustered messages: when navigating to a user message, if subsequent
    // messages in the same direction are within one viewport height (i.e., they'd
    // all be visible on screen at the standard position), jump past them to the
    // first message of the next cluster.
    //
    // UP: after stepping to cursor, keep advancing while the next older message
    //     is within navViewportHeight of the current target → stop at the oldest
    //     in that cluster (the "first" one the user would see at standard position).
    // DOWN: after stepping to cursor, keep advancing while the next newer message
    //     is within navViewportHeight of the current target → stop at the newest
    //     in that cluster.

    // Check if message is off-screen ABOVE viewport (scrolled past the top).
    // Used by UP: only jump back to current message if it went off the top.
    const isMessageAboveScreen = React.useCallback(
      (pos: number) => {
        const cumH = buildCumulativeHeights();
        const flatIdx = userMessageIndices[pos];
        const msgTop = cumH[flatIdx + 1];
        const vpTop = navScrollY + navViewportHeight;
        const result = msgTop > vpTop;
        chatNavLog('isMessageAboveScreen', {
          pos,
          flatIdx,
          msgTop: Math.round(msgTop),
          vpTop: Math.round(vpTop),
          result,
        });
        return result;
      },
      [
        buildCumulativeHeights,
        userMessageIndices,
        navScrollY,
        navViewportHeight,
      ],
    );

    // Check if message is off-screen BELOW viewport (scrolled past the bottom).
    // Used by DOWN: only jump back to current message if it went off the bottom.
    const isMessageBelowScreen = React.useCallback(
      (pos: number) => {
        const cumH = buildCumulativeHeights();
        const flatIdx = userMessageIndices[pos];
        const msgTop = cumH[flatIdx + 1];
        const result = msgTop < navScrollY;
        chatNavLog('isMessageBelowScreen', {
          pos,
          flatIdx,
          msgTop: Math.round(msgTop),
          scrollY: Math.round(navScrollY),
          result,
        });
        return result;
      },
      [buildCumulativeHeights, userMessageIndices, navScrollY],
    );

    // Check if the last scroll target is still visible on screen.
    // If not, the user has scrolled away and cursor should reinit.
    const hasUserScrolledAway = React.useCallback(() => {
      const target = lastNavTargetRef.current;
      if (target < 0) {
        chatNavLog('hasUserScrolledAway', {
          target,
          result: true,
          reason: 'no-target',
        });
        return true;
      }
      const cumH = buildCumulativeHeights();
      const msgTop = cumH[target + 1];
      const vpTop = navScrollY + navViewportHeight;
      const below = msgTop < navScrollY;
      const above = msgTop > vpTop;
      const result = below || above;
      chatNavLog('hasUserScrolledAway', {
        target,
        msgTop: Math.round(msgTop),
        scrollY: Math.round(navScrollY),
        vpTop: Math.round(vpTop),
        below,
        above,
        result,
      });
      return result;
    }, [buildCumulativeHeights, navScrollY, navViewportHeight]);

    // Jump to previous user message (older = higher position in array = scroll UP).
    const handleNavPrevious = React.useCallback(() => {
      const len = userMessageIndices.length;
      if (len === 0) {
        return;
      }

      let cursor = navCursorRef.current;
      let skipCluster = false;
      const prevCursor = cursor;
      chatNavLog('UP entry', {
        cursor,
        lastNavTarget: lastNavTargetRef.current,
      });

      if (cursor === -1 || hasUserScrolledAway()) {
        // First press or user scrolled away: initialize from scroll position.
        const pos = initNavCursor();
        const offScreen = isMessageAboveScreen(pos);
        chatNavLog('UP init branch', {
          pos,
          offScreen,
          decision: offScreen ? 'cursor=pos' : 'cursor=pos+1',
        });
        if (offScreen) {
          cursor = pos;
        } else {
          cursor = pos + 1;
        }
        skipCluster = true;
      } else {
        chatNavLog('UP step branch', {
          from: cursor,
          to: cursor + 1,
        });
        cursor = cursor + 1;
      }

      if (cursor >= len) {
        chatNavLog('UP bail', {cursor, len, reason: 'cursor>=len'});
        return;
      }

      // Skip cluster: keep going older while next message is within one screen.
      // Skipped when cursor was just (re-)initialized to avoid overshooting.
      if (!skipCluster) {
        const cumH = buildCumulativeHeights();
        const anchorH = cumH[userMessageIndices[cursor] + 1];
        const beforeCluster = cursor;
        chatNavLog('UP cluster check start', {
          anchorPos: cursor,
          anchorFlatIdx: userMessageIndices[cursor],
          anchorH: Math.round(anchorH),
          vpH: Math.round(navViewportHeight),
        });
        while (
          cursor + 1 < len &&
          cumH[userMessageIndices[cursor + 1] + 1] - anchorH < navViewportHeight
        ) {
          const nextH = cumH[userMessageIndices[cursor + 1] + 1];
          chatNavLog('UP cluster step', {
            nextPos: cursor + 1,
            nextFlatIdx: userMessageIndices[cursor + 1],
            nextH: Math.round(nextH),
            diff: Math.round(nextH - anchorH),
            vpH: Math.round(navViewportHeight),
            fits: true,
          });
          cursor++;
        }
        if (cursor + 1 < len) {
          const nextH = cumH[userMessageIndices[cursor + 1] + 1];
          chatNavLog('UP cluster stop', {
            nextPos: cursor + 1,
            nextFlatIdx: userMessageIndices[cursor + 1],
            nextH: Math.round(nextH),
            diff: Math.round(nextH - anchorH),
            vpH: Math.round(navViewportHeight),
            fits: false,
          });
        }
        if (cursor !== beforeCluster) {
          chatNavLog('UP cluster skip', {from: beforeCluster, to: cursor});
        }
      } else {
        chatNavLog('UP cluster skipped (init)', {cursor});
      }

      chatNavLog('UP result', {
        prevCursor,
        cursor,
        flatIdx: userMessageIndices[cursor],
        skipCluster,
      });
      navCursorRef.current = cursor;
      lastNavTargetRef.current = userMessageIndices[cursor];
      list.current?.scrollToIndex({
        index: userMessageIndices[cursor],
        animated: true,
        viewPosition: 1,
      });
    }, [
      userMessageIndices,
      initNavCursor,
      isMessageAboveScreen,
      hasUserScrolledAway,
      buildCumulativeHeights,
      navViewportHeight,
    ]);

    // Jump to next user message (newer = lower position in array = scroll DOWN).
    const handleNavNext = React.useCallback(() => {
      const len = userMessageIndices.length;
      if (len === 0) {
        return;
      }

      let cursor = navCursorRef.current;
      let skipCluster = false;
      const prevCursor = cursor;
      chatNavLog('DOWN entry', {
        cursor,
        lastNavTarget: lastNavTargetRef.current,
      });

      if (cursor === -1 || hasUserScrolledAway()) {
        // First press or user scrolled away: initialize from scroll position.
        const pos = initNavCursor();
        const offScreen = isMessageBelowScreen(pos);
        chatNavLog('DOWN init branch', {
          pos,
          offScreen,
          decision: offScreen ? 'cursor=pos' : 'cursor=pos-1',
        });
        if (offScreen) {
          cursor = pos;
        } else {
          cursor = pos - 1;
        }
        skipCluster = true;
      } else {
        chatNavLog('DOWN step branch', {
          from: cursor,
          to: cursor - 1,
        });
        cursor = cursor - 1;
      }

      if (cursor < 0) {
        // No newer message — scroll to bottom
        chatNavLog('DOWN bail', {cursor, reason: 'cursor<0, scroll to bottom'});
        navCursorRef.current = -1;
        lastNavTargetRef.current = -1;
        list.current?.scrollToIndex({
          index: 0,
          animated: true,
        });
        return;
      }

      // Skip cluster: use UP's precomputed stop points so DOWN visits
      // the same positions in reverse, ensuring symmetric navigation.
      // Skipped when cursor was just (re-)initialized to avoid overshooting.
      if (!skipCluster) {
        const cumH = buildCumulativeHeights();
        const beforeCluster = cursor;

        // Precompute UP's cluster stops (greedy from bottom).
        const stops: number[] = [0];
        let si = 0;
        while (si < len) {
          let sj = si + 1;
          if (sj >= len) {
            break;
          }
          const anchorH = cumH[userMessageIndices[sj] + 1];
          while (
            sj + 1 < len &&
            cumH[userMessageIndices[sj + 1] + 1] - anchorH < navViewportHeight
          ) {
            sj++;
          }
          stops.push(sj);
          si = sj;
        }

        chatNavLog('DOWN cluster stops', {stops, cursor});

        // Find the stop at or below the current cursor.
        let stopIdx = stops.length - 1;
        while (stopIdx >= 0 && stops[stopIdx] > cursor) {
          stopIdx--;
        }
        if (stopIdx >= 0) {
          cursor = stops[stopIdx];
        }

        if (cursor !== beforeCluster) {
          chatNavLog('DOWN cluster skip', {from: beforeCluster, to: cursor});
        }
      } else {
        chatNavLog('DOWN cluster skipped (init)', {cursor});
      }

      chatNavLog('DOWN result', {
        prevCursor,
        cursor,
        flatIdx: userMessageIndices[cursor],
        skipCluster,
      });
      navCursorRef.current = cursor;
      lastNavTargetRef.current = userMessageIndices[cursor];
      list.current?.scrollToIndex({
        index: userMessageIndices[cursor],
        animated: true,
        viewPosition: 1,
      });
    }, [
      userMessageIndices,
      initNavCursor,
      isMessageBelowScreen,
      hasUserScrolledAway,
      buildCumulativeHeights,
      navViewportHeight,
    ]);

    // ============ MESSAGE INPUT HANDLERS ============
    const wrappedOnSendPress = React.useCallback(
      async (message: MessageType.PartialText) => {
        if (chatSessionStore.isEditMode) {
          await chatSessionStore.commitEdit();
        }
        onSendPress(message);
        setInputText('');
        Keyboard.dismiss();
      },
      [onSendPress],
    );

    const activeSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );
    const activeModel = modelStore.activeModel;
    const contextSize =
      modelStore.activeContextSettings?.n_ctx ??
      modelStore.contextInitParams.n_ctx;
    const pruneChatHistoryBeforeSend = modelStore.pruneChatHistoryBeforeSend;
    const sessionCompletionSettings =
      activeSession?.completionSettings ??
      chatSessionStore.newChatCompletionSettings;
    const systemMessages = React.useMemo(
      () =>
        resolveSystemMessages({
          pal: activePal,
          model: activeModel,
        }),
      [activeModel, activePal],
    );
    const [contextUsage, setContextUsage] =
      React.useState<ChatInputAdditionalProps['contextUsage']>();
    const pendingContextUsageEstimateRef = React.useRef<
      Parameters<typeof estimateChatContextUsage>[0] | null
    >(null);
    const isContextUsageEstimateRunningRef = React.useRef(false);
    const latestContextUsageEstimateIdRef = React.useRef(0);
    const appliedContextUsageEstimateIdRef = React.useRef(0);
    const isContextUsageEstimatorMountedRef = React.useRef(true);

    React.useEffect(() => {
      return () => {
        isContextUsageEstimatorMountedRef.current = false;
      };
    }, []);

    const runContextUsageEstimate = React.useCallback(async () => {
      if (isContextUsageEstimateRunningRef.current) {
        return;
      }

      isContextUsageEstimateRunningRef.current = true;

      try {
        while (pendingContextUsageEstimateRef.current) {
          const pendingEstimate = pendingContextUsageEstimateRef.current;
          pendingContextUsageEstimateRef.current = null;

          const estimateId = ++latestContextUsageEstimateIdRef.current;
          const result = await estimateChatContextUsage(pendingEstimate);

          if (
            !isContextUsageEstimatorMountedRef.current ||
            estimateId < latestContextUsageEstimateIdRef.current ||
            estimateId < appliedContextUsageEstimateIdRef.current
          ) {
            continue;
          }

          appliedContextUsageEstimateIdRef.current = estimateId;
          setContextUsage(result ?? undefined);
        }
      } finally {
        isContextUsageEstimateRunningRef.current = false;
      }
    }, []);

    React.useEffect(() => {
      const draftText = inputText.trim();
      const draftMessage =
        draftText.length > 0 || inputImages.length > 0
          ? {
              role: 'user' as const,
              content:
                inputImages.length > 0
                  ? [
                      {type: 'text' as const, text: draftText},
                      ...inputImages.map(path => ({
                        type: 'image_url' as const,
                        image_url: {url: path},
                      })),
                    ]
                  : draftText,
            }
          : undefined;

      pendingContextUsageEstimateRef.current = {
        systemMessages,
        chatMessages: convertToChatMessages(messages, isVisionEnabled),
        userMessage: draftMessage as any,
        contextSize,
        reservedOutputTokens: sessionCompletionSettings?.reserved_output_tokens,
        pruneHistory: pruneChatHistoryBeforeSend,
        context: modelStore.context,
        model: activeModel,
        enableThinking: sessionCompletionSettings?.enable_thinking,
        reasoningFormat: sessionCompletionSettings?.reasoning_format,
      };

      runContextUsageEstimate().catch(error => {
        console.error('Failed to estimate chat context usage:', error);
      });
    }, [
      activeModel,
      contextSize,
      inputImages,
      inputText,
      isVisionEnabled,
      messages,
      pruneChatHistoryBeforeSend,
      sessionCompletionSettings?.enable_thinking,
      sessionCompletionSettings?.n_predict,
      sessionCompletionSettings?.reserved_output_tokens,
      sessionCompletionSettings?.reasoning_format,
      systemMessages,
      runContextUsageEstimate,
    ]);

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
        if (message.type !== 'text') {
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
      if (!selectedMessage || selectedMessage.type !== 'text') {
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

    // Render individual message
    const renderMessage = React.useCallback(
      ({
        item: message,
        index,
      }: {
        item: MessageType.DerivedAny;
        index: number;
      }) => {
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

        return (
          <View
            onLayout={e => {
              itemHeightsRef.current.set(index, e.nativeEvent.layout.height);
            }}>
            <Message
              {...{
                enableAnimation,
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
        <ChatEmptyPlaceholder
          bottomComponentHeight={bottomComponentHeight}
          onSelectModel={() => setIsPickerVisible(true)}
        />
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

    // Render header (loading bubble and keyboard spacer)
    const renderListHeaderComponent = React.useCallback(
      () => (
          <>
          {isThinking && (
            <LoadingBubble
              label={l10n.benchmark.benchmarkResultCard.results.promptProcessing}
              progress={promptProcessingProgress}
            />
          )}
          {chatMessages.length > 0 && <Reanimated.View style={headerStyle} />}
        </>
      ),
      [isThinking, promptProcessingProgress, chatMessages.length, headerStyle, l10n],
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
              onLayout={handleFlatListLayout}
              onContentSizeChange={handleContentSizeChange}
              {...unwrap(flatListProps)}
              data={chatMessages}
              inverted={chatMessages.length > 0}
              keyboardDismissMode="interactive"
              keyExtractor={keyExtractor}
              onEndReached={handleEndReached}
              ref={list}
              renderItem={renderMessage}
              onScrollToIndexFailed={info => {
                // Scroll to approximate offset when index is not rendered yet
                const offset = info.averageItemLength * info.index;
                list.current?.scrollToOffset({offset, animated: true});
                // Retry after layout
                setTimeout(() => {
                  if (list.current && info.index < chatMessages.length) {
                    list.current.scrollToIndex({
                      index: info.index,
                      animated: true,
                      viewPosition: 0,
                    });
                  }
                }, 200);
              }}
              maintainVisibleContentPosition={
                isStreaming
                  ? {
                      autoscrollToTopThreshold: 300,
                      minIndexForVisible: 1,
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
                  60 /* padding */,
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
        handleFlatListLayout,
        handleContentSizeChange,
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

            {/* Chat navigation bar */}
            <ChatNavigationBar
              nodes={navBarProps.nodes}
              thumbTop={navBarProps.thumbTop}
              thumbHeight={navBarProps.thumbHeight}
              onPrevious={handleNavPrevious}
              onNext={handleNavNext}
              visible={chatMessages.length > 0}
              bottomOffset={bottomComponentHeight}
            />

            {/* Chat input */}
            <Reanimated.View
              onLayout={onLayoutChatInput}
              style={[
                styles.inputContainer,
                inputContainerAnimatedStyle,
                {backgroundColor: inputBackgroundColor},
              ]}>
              <ChatInput
                {...{
                  ...unwrap(inputProps),
                  isStreaming,
                  onSendPress: wrappedOnSendPress,
                  onStopPress,
                  chatInputHeight,
                  inputBackgroundColor,
                  contextUsage,
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
        </View>
      </UserContext.Provider>
    );
  },
);
