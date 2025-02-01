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
  Animated,
} from 'react-native';

import dayjs from 'dayjs';
import {observer} from 'mobx-react';
import calendar from 'dayjs/plugin/calendar';
import {useHeaderHeight} from '@react-navigation/elements';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  KeyboardAvoidingView,
  useKeyboardAnimation,
} from 'react-native-keyboard-controller';

import {
  useComponentSize,
  useKeyboardDimensions,
} from '../KeyboardAccessoryView/hooks';

import {usePrevious, useTheme, useMessageActions} from '../../hooks';

import ImageView from './ImageView';
import {createStyles} from './styles';

import {chatSessionStore, modelStore} from '../../store';
import {SelectTextView} from '../SelectTextView';
import {l10n} from '../../utils/l10n';
import {MessageType, User} from '../../utils/types';
import {
  calculateChatMessages,
  initLocale,
  L10nContext,
  unwrap,
  UserContext,
} from '../../utils';

import {
  Message,
  MessageTopLevelProps,
  CircularActivityIndicator,
  ChatInput,
  ChatInputAdditionalProps,
  ChatInputTopLevelProps,
  Menu,
  LoadingBubble,
  PocketPalIconAnimation,
} from '..';

// Untestable
/* istanbul ignore next */
const animate = () => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
};

dayjs.extend(calendar);

export type ChatTopLevelProps = ChatInputTopLevelProps & MessageTopLevelProps;

export interface ChatProps extends ChatTopLevelProps {
  /** Allows you to replace the default Input widget e.g. if you want to create a channel view. */
  customBottomComponent?: () => React.ReactNode;
  /** If {@link ChatProps.dateFormat} and/or {@link ChatProps.timeFormat} is not enough to
   * customize date headers in your case, use this to return an arbitrary
   * string based on a `dateTime` of a particular message. Can be helpful to
   * return "Today" if `dateTime` is today. IMPORTANT: this will replace
   * all default date headers, so you must handle all cases yourself, like
   * for example today, yesterday and before. Or you can just return the same
   * date header for any message. */
  customDateHeaderText?: (dateTime: number) => string;
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
  /** Override the default localized copy. */
  l10nOverride?: Partial<
    Record<keyof (typeof l10n)[keyof typeof l10n], string>
  >;
  locale?: keyof typeof l10n;
  messages: MessageType.Any[];
  /** Used for pagination (infinite scroll). Called when user scrolls
   * to the very end of the list (minus `onEndReachedThreshold`).
   * See {@link ChatProps.flatListProps} to set it up. */
  onEndReached?: () => Promise<void>;
  /** Show user names for received messages. Useful for a group chat. Will be
   * shown only on text messages. */
  showUserNames?: boolean;
  /**
   * Allows you to customize the time format. IMPORTANT: only for the time,
   * do not return date here. @see {@link ChatProps.dateFormat} to customize the date format.
   * @see {@link ChatProps.customDateHeaderText} for more customization.
   */
  timeFormat?: string;
  user: User;
}

type MenuItem = {
  label: string;
  onPress?: () => void;
  icon?: string;
  disabled: boolean;
  submenu?: SubMenuItem[];
};

type SubMenuItem = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  width?: number;
};

/** Entry component, represents the complete chat */
export const ChatView = observer(
  ({
    customBottomComponent,
    customDateHeaderText,
    dateFormat,
    disableImageGallery,
    enableAnimation,
    flatListProps,
    inputProps,
    isAttachmentUploading,
    isLastPage,
    isStopVisible,
    isStreaming = false,
    isThinking = false,
    l10nOverride,
    locale = 'en',
    messages,
    onAttachmentPress,
    onEndReached,
    onMessageLongPress: externalOnMessageLongPress,
    onMessagePress,
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
    textInputProps,
    timeFormat,
    usePreviewData = true,
    user,
  }: ChatProps) => {
    const theme = useTheme();
    const styles = createStyles({theme});

    const [inputText, setInputText] = React.useState('');

    const animationRef = React.useRef(false);
    const list = React.useRef<FlatList<MessageType.DerivedAny>>(null);
    const insets = useSafeAreaInsets();
    const {progress} = useKeyboardAnimation();
    const headerHeight = useHeaderHeight();

    const {onLayout, size} = useComponentSize();
    const {onLayout: onLayoutChatInput, size: chatInputHeight} =
      useComponentSize();
    const {
      onLayout: onLayoutCustomBottomComponent,
      size: customBottomComponentHeight,
    } = useComponentSize();

    const bottomComponentHeight = React.useMemo(() => {
      const height = customBottomComponent
        ? customBottomComponentHeight.height
        : chatInputHeight.height;
      return height;
    }, [
      customBottomComponent,
      customBottomComponentHeight.height,
      chatInputHeight.height,
    ]);

    const listPaddingBottom = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [
        bottomComponentHeight,
        bottomComponentHeight - insets.bottom,
      ],
    });

    const {keyboardHeight: keyboardHeight} = useKeyboardDimensions(true);
    const translateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [
        0,
        Math.max(0, Math.min(insets.bottom, keyboardHeight - insets.bottom)),
      ],
    });

    const [isImageViewVisible, setIsImageViewVisible] = React.useState(false);
    const [isNextPageLoading, setNextPageLoading] = React.useState(false);
    const [imageViewIndex, setImageViewIndex] = React.useState(0);
    const [stackEntry, setStackEntry] = React.useState<StatusBarProps>({});

    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const [isUserScrolling, setIsUserScrolling] = React.useState(false);

    const handleScroll = React.useCallback(event => {
      const {contentOffset} = event.nativeEvent;
      const isAtTop = contentOffset.y <= 0;
      setShowScrollButton(!isAtTop);
    }, []);

    const scrollToBottom = React.useCallback(() => {
      list.current?.scrollToOffset({
        animated: true,
        offset: 0,
      });
      setIsUserScrolling(false);
    }, []);

    const handleScrollBeginDrag = React.useCallback(() => {
      setIsUserScrolling(true);
    }, []);

    const wrappedOnSendPress = React.useCallback(
      async (message: MessageType.PartialText) => {
        if (chatSessionStore.isEditMode) {
          chatSessionStore.commitEdit();
        }
        onSendPress(message);
        setInputText('');
        setIsUserScrolling(false);
      },
      [onSendPress],
    );

    const handleCancelEdit = React.useCallback(() => {
      setInputText('');
      chatSessionStore.exitEditMode();
    }, []);

    const {
      handleSelectView,
      handleCopy,
      handleEdit,
      handleTryAgain,
      handleTryAgainWith,
      isSelectionModalVisible,
      selectedMessageContent,
      handleTextSelected,
      setSelectionModalVisible,
    } = useMessageActions({
      user,
      messages,
      handleSendPress: wrappedOnSendPress,
      setInputText,
    });

    const l10nValue = React.useMemo(
      () => ({...l10n[locale], ...unwrap(l10nOverride)}),
      [l10nOverride, locale],
    );

    const {chatMessages, gallery} = calculateChatMessages(messages, user, {
      customDateHeaderText,
      dateFormat,
      showUserNames,
      timeFormat,
    });

    const previousChatMessages = usePrevious(chatMessages);

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

    React.useEffect(() => {
      initLocale(locale);
    }, [locale]);

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

    const menuItems = React.useMemo((): MenuItem[] => {
      if (!selectedMessage || selectedMessage.type !== 'text') {
        return [];
      }

      const isAuthor = selectedMessage.author.id === user.id;
      const hasActiveModel = modelStore.activeModelId !== undefined;
      const models = modelStore.availableModels || [];

      const baseItems: MenuItem[] = [
        {
          label: 'Copy',
          onPress: () => {
            handleCopy(selectedMessage);
            handleMenuDismiss();
          },
          icon: 'content-copy',
          disabled: false,
        },
        {
          label: 'Select Text',
          onPress: () => {
            handleSelectView(selectedMessage);
            handleMenuDismiss();
          },
          icon: 'select-drag',
          disabled: false,
        },
      ];

      if (!isAuthor) {
        baseItems.push({
          label: 'Regenerate',
          onPress: () => {
            handleTryAgain(selectedMessage);
            handleMenuDismiss();
          },
          icon: 'refresh',
          disabled: !hasActiveModel,
        });

        baseItems.push({
          label: 'Regenerate with',
          icon: 'chevron-right',
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
          label: 'Edit',
          onPress: () => {
            handleEdit(selectedMessage);
            handleMenuDismiss();
          },
          icon: 'pencil',
          disabled: !hasActiveModel,
        });
      }

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
      handleSelectView,
    ]);

    const renderMenuItem = React.useCallback(
      (item: MenuItem, index: number) => {
        if (item.submenu) {
          return (
            <React.Fragment key={index}>
              {index > 0 && <Menu.Separator />}
              <Menu.Item
                style={styles.menu}
                label={item.label}
                icon={item.icon}
                disabled={item.disabled}
                submenu={item.submenu.map(
                  (subItem: SubMenuItem, subIndex: number) => (
                    <React.Fragment key={subIndex}>
                      {subIndex > 0 && <Menu.Separator />}
                      <Menu.Item
                        key={subIndex}
                        style={{...styles.menu, width: subItem.width}}
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
            {index > 0 && <Menu.Separator />}
            <Menu.Item
              style={styles.menu}
              label={item.label}
              onPress={item.onPress}
              icon={item.icon}
              disabled={item.disabled}
            />
          </React.Fragment>
        );
      },
      [styles.menu],
    );

    const renderMessage = React.useCallback(
      ({item: message}: {item: MessageType.DerivedAny; index: number}) => {
        const messageWidth =
          showUserAvatars &&
          message.type !== 'dateHeader' &&
          message.author?.id !== user.id
            ? Math.floor(Math.min(size.width * 0.9, 440))
            : Math.floor(Math.min(size.width * 0.92, 440));

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

    const renderListEmptyComponent = React.useCallback(
      () => <PocketPalIconAnimation testID="empty-state-component" />,
      [],
    );

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

    const renderListHeaderComponent = React.useCallback(
      () => (isThinking ? <LoadingBubble /> : null),
      [isThinking],
    );

    const renderChatList = React.useCallback(
      () => (
        <>
          <Animated.FlatList
            automaticallyAdjustContentInsets={false}
            contentContainerStyle={[
              styles.flatListContentContainer,
              // eslint-disable-next-line react-native/no-inline-styles
              {
                justifyContent:
                  chatMessages.length !== 0 ? undefined : 'center',
                paddingTop: listPaddingBottom, // Use animated padding
              },
            ]}
            initialNumToRender={10}
            ListEmptyComponent={renderListEmptyComponent}
            ListFooterComponent={renderListFooterComponent}
            ListHeaderComponent={renderListHeaderComponent}
            maxToRenderPerBatch={6}
            onEndReachedThreshold={0.75}
            style={styles.flatList}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            {...unwrap(flatListProps)}
            data={chatMessages}
            inverted
            keyboardDismissMode="interactive"
            keyExtractor={keyExtractor}
            onEndReached={handleEndReached}
            ref={list}
            renderItem={renderMessage}
            onScrollBeginDrag={handleScrollBeginDrag}
            maintainVisibleContentPosition={
              !isUserScrolling
                ? undefined
                : {
                    minIndexForVisible: 1,
                  }
            }
          />
          {showScrollButton && (
            <Animated.View style={{transform: [{translateY}]}}>
              <TouchableOpacity
                style={[
                  styles.scrollToBottomButton,
                  {bottom: bottomComponentHeight + 20},
                ]}
                onPress={scrollToBottom}>
                <Icon
                  name="chevron-down"
                  size={24}
                  color={theme.colors.onPrimary}
                />
              </TouchableOpacity>
            </Animated.View>
          )}
        </>
      ),
      [
        styles.flatListContentContainer,
        styles.flatList,
        styles.scrollToBottomButton,
        chatMessages,
        listPaddingBottom,
        renderListEmptyComponent,
        renderListFooterComponent,
        renderListHeaderComponent,
        handleScroll,
        flatListProps,
        keyExtractor,
        handleEndReached,
        renderMessage,
        handleScrollBeginDrag,
        isUserScrolling,
        showScrollButton,
        translateY,
        bottomComponentHeight,
        scrollToBottom,
        theme.colors.onPrimary,
      ],
    );

    return (
      <UserContext.Provider value={user}>
        <L10nContext.Provider value={l10nValue}>
          <View style={styles.container} onLayout={onLayout}>
            {customBottomComponent ? (
              <>
                <View style={styles.container}>{renderChatList()}</View>
                <View
                  onLayout={onLayoutCustomBottomComponent}
                  style={styles.customBottomComponent}>
                  {customBottomComponent()}
                </View>
              </>
            ) : (
              <>
                <KeyboardAvoidingView
                  behavior="padding"
                  keyboardVerticalOffset={headerHeight}
                  style={styles.container}>
                  <View style={styles.chatContainer}>
                    {renderChatList()}
                    <Animated.View
                      onLayout={onLayoutChatInput}
                      style={[
                        styles.inputContainer,
                        {
                          paddingBottom: insets.bottom,
                          transform: [{translateY}],
                        },
                      ]}>
                      <ChatInput
                        {...{
                          ...unwrap(inputProps),
                          isAttachmentUploading,
                          isStreaming,
                          onAttachmentPress,
                          onSendPress: wrappedOnSendPress,
                          onStopPress,
                          onCancelEdit: handleCancelEdit,
                          isStopVisible,
                          sendButtonVisibilityMode,
                          textInputProps: {
                            ...textInputProps,
                            value: inputText,
                            onChangeText: setInputText,
                          },
                        }}
                      />
                    </Animated.View>
                  </View>
                </KeyboardAvoidingView>
              </>
            )}
            <ImageView
              imageIndex={imageViewIndex}
              images={gallery}
              onRequestClose={handleRequestClose}
              visible={isImageViewVisible}
            />
            <SelectTextView
              visible={isSelectionModalVisible}
              onClose={() => setSelectionModalVisible(false)}
              content={selectedMessageContent}
              onTextSelected={handleTextSelected}
            />
            <Menu
              visible={menuVisible}
              onDismiss={handleMenuDismiss}
              selectable={false}
              anchor={menuPosition}>
              {menuItems.map(renderMenuItem)}
            </Menu>
          </View>
        </L10nContext.Provider>
      </UserContext.Provider>
    );
  },
);
