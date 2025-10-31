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
} from 'react-native-reanimated';

import {
  useComponentSize,
  useKeyboardDimensions,
} from '../KeyboardAccessoryView/hooks';

import {useTheme, useMessageActions} from '../../hooks';

import ImageView from './ImageView';
import {createStyles} from './styles';

import {chatSessionStore, modelStore} from '../../store';

import {MessageType, User} from '../../utils/types';
import {Pal} from '../../types/pal';
import {calculateChatMessages, unwrap, UserContext} from '../../utils';
import {L10nContext} from '../../utils';
import {hasVideoCapability} from '../../utils/pal-capabilities';

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
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles({theme});

    const [inputText, setInputText] = React.useState('');
    const [inputImages, setInputImages] = React.useState<string[]>([]);
    const [isPickerVisible, setIsPickerVisible] = React.useState(false);

    const animationRef = React.useRef(false);
    const list = React.useRef<FlatList<MessageType.DerivedAny>>(null);
    const insets = useSafeAreaInsets();

    // Handle initial input text from deep linking
    React.useEffect(() => {
      if (initialInputText && initialInputText.trim()) {
        setInputText(initialInputText);
        onInitialTextConsumed?.();
      }
    }, [initialInputText, onInitialTextConsumed]);

    const {onLayout, size} = useComponentSize();
    const {onLayout: onLayoutChatInput, size: chatInputHeight} =
      useComponentSize();

    const bottomComponentHeight = React.useMemo(() => {
      const height = chatInputHeight.height;
      return height;
    }, [chatInputHeight.height]);

    const {keyboardHeight: keyboardHeight} = useKeyboardDimensions(true);

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

    const [isImageViewVisible, setIsImageViewVisible] = React.useState(false);
    const [isNextPageLoading, setNextPageLoading] = React.useState(false);
    const [imageViewIndex, setImageViewIndex] = React.useState(0);
    const [stackEntry, setStackEntry] = React.useState<StatusBarProps>({});

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

    const underflow = useSharedValue(true);
    const atLatest = useSharedValue(true);

    const STICK = 24;
    const LEAVE = 40;
    const EPS = 1;

    // --- Scroll tracking with Reanimated ---
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

    const hasHiddenContent = useDerivedValue(() => {
      return !underflow.value && !atLatest.value ? 1 : 0;
    });

    const scrollToBottomAnimatedStyle = useAnimatedStyle(() => ({
      opacity: withTiming(hasHiddenContent.value, {duration: 160}),
      transform: [{translateY: withTiming(hasHiddenContent.value ? 0 : 8)}],
    }));

    const scrollToBottom = React.useCallback(() => {
      list.current?.scrollToOffset({
        animated: true,
        offset: 0,
      });
    }, []);

    const wrappedOnSendPress = React.useCallback(
      async (message: MessageType.PartialText) => {
        if (chatSessionStore.isEditMode) {
          await chatSessionStore.commitEdit();
        }
        onSendPress(message);
        setInputText('');
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

    const {chatMessages, gallery} = calculateChatMessages(messages, user, {
      customDateHeaderText,
      dateFormat,
      showUserNames,
      timeFormat,
      showDateHeaders,
    });

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

    const handleMessagePress = React.useCallback(
      (message: MessageType.Any) => {
        if (message.type === 'image' && !disableImageGallery) {
          handleImagePress(message);
        }
        onMessagePress?.(message);
      },
      [disableImageGallery, handleImagePress, onMessagePress],
    );

    // TODO: Tapping on a close button results in the next warning:
    // `An update to ImageViewing inside a test was not wrapped in act(...).`
    /* istanbul ignore next */
    const handleRequestClose = () => {
      setIsImageViewVisible(false);
      StatusBar.popStackEntry(stackEntry);
    };

    const keyExtractor = React.useCallback(
      ({id}: MessageType.DerivedAny) => id,
      [],
    );

    const [menuVisible, setMenuVisible] = React.useState(false);
    const [menuPosition, setMenuPosition] = React.useState({x: 0, y: 0});
    const [selectedMessage, setSelectedMessage] =
      React.useState<MessageType.Any | null>(null);
    const [isReportSheetVisible, setIsReportSheetVisible] =
      React.useState(false);

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

        return (
          <View>
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

    // --- ListHeaderComponent as animated spacer (inverted list: header is at bottom) ---
    // We use this to create a spacer at the bottom of the list to account for the keyboard height.
    // So we can move up/down when the keyboard is shown/hidden.
    const headerStyle = useAnimatedStyle(() => {
      // only animate when not streaming
      // if (isStreaming) return {height: 0};

      // Only lift when keyboard is actively moving
      const shouldLift = trackingKeyboardMovement.value;
      return {
        height: withTiming(
          shouldLift ? Math.abs(keyboard.height.value) - insets.bottom : 0,
          {
            duration: !hasHiddenContent.value
              ? 0 // if we don't have hidden content, we can animate immediately, so it feels more natural
              : 1000, // if we have hidden content, we need to animate slower to give time to maintainVisibleContentPosition, so it doesn't feel janky
          },
        ),
      };
    });

    const renderListHeaderComponent = React.useCallback(
      () => (
        <>
          {isThinking && <LoadingBubble />}
          <Reanimated.View style={headerStyle} />
        </>
      ),
      [isThinking, headerStyle],
    );

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
                    chatMessages.length !== 0 ? 'flex-end' : 'center',
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
                isStreaming || hasHiddenContent.value
                  ? {
                      autoscrollToTopThreshold: 1,
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
                  size={24}
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
        hasHiddenContent.value,
        scrollToBottomAnimatedStyle,
        insets.bottom,
        scrollToBottom,
        theme.colors.onPrimary,
      ],
    );

    const [_selectedModel, setSelectedModel] = React.useState<string | null>(
      null,
    );
    const [_selectedPal, setSelectedPal] = React.useState<string | undefined>();

    const handleModelSelect = React.useCallback((model: string) => {
      setSelectedModel(model);
      setIsPickerVisible(false);
    }, []);

    const handlePalSelect = React.useCallback((pal: string | undefined) => {
      setSelectedPal(pal);
      setIsPickerVisible(false);
    }, []);

    const inputBackgroundColor = activePal?.color?.[1]
      ? activePal.color?.[1]
      : theme.colors.surface;

    return (
      <UserContext.Provider value={user}>
        <View
          style={[styles.container, {backgroundColor: inputBackgroundColor}]}
          onLayout={onLayout}>
          <View style={styles.headerWrapper}>
            <ChatHeader />
          </View>
          <Reanimated.View style={styles.chatContainer}>
            {customContent}
            {renderChatList()}
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
                keyboardHeight={keyboardHeight}
              />
            )}
          </Reanimated.View>
          <ImageView
            imageIndex={imageViewIndex}
            images={gallery}
            onRequestClose={handleRequestClose}
            visible={isImageViewVisible}
          />
          <Menu
            visible={menuVisible}
            onDismiss={handleMenuDismiss}
            selectable={false}
            anchor={menuPosition}>
            {menuItems.map(renderMenuItem)}
          </Menu>
          <ContentReportSheet
            isVisible={isReportSheetVisible}
            onClose={() => setIsReportSheetVisible(false)}
          />
        </View>
      </UserContext.Provider>
    );
  },
);
