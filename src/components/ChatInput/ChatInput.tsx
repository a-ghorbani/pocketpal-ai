import * as React from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  Animated,
  TouchableOpacity,
} from 'react-native';

import Color from 'tinycolor2';
import {observer} from 'mobx-react';
import {IconButton, Text} from 'react-native-paper';

import {PalType} from '../PalsSheets/types';

import {ChevronUpIcon, CameraIcon, VideoRecorderIcon} from '../../assets/icons';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {chatSessionStore, modelStore, palStore, uiStore} from '../../store';

import {MessageType} from '../../utils/types';
import {L10nContext, unwrap, UserContext} from '../../utils';

import {
  AttachmentButton,
  AttachmentButtonAdditionalProps,
  CircularActivityIndicator,
  CircularActivityIndicatorProps,
  SendButton,
  StopButton,
} from '..';

export interface ChatInputTopLevelProps {
  /** Whether attachment is uploading. Will replace attachment button with a
   * {@link CircularActivityIndicator}. Since we don't have libraries for
   * managing media in dependencies we have no way of knowing if
   * something is uploading so you need to set this manually. */
  isAttachmentUploading?: boolean;
  /** Whether the AI is currently streaming tokens */
  isStreaming?: boolean;
  /** @see {@link AttachmentButtonProps.onPress} */
  onAttachmentPress?: () => void;
  /** Will be called on {@link SendButton} tap. Has {@link MessageType.PartialText} which can
   * be transformed to {@link MessageType.Text} and added to the messages list. */
  onSendPress: (message: MessageType.PartialText) => void;
  onStopPress?: () => void;
  onCancelEdit?: () => void;
  onPalBtnPress?: () => void;
  isStopVisible?: boolean;
  /** Controls the visibility behavior of the {@link SendButton} based on the
   * `TextInput` state. Defaults to `editing`. */
  sendButtonVisibilityMode?: 'always' | 'editing';
  textInputProps?: TextInputProps;
  isPickerVisible?: boolean;
  inputBackgroundColor?: string;
  /** Type of Pal being used, affects the input rendering */
  palType?: PalType;
  /** Camera-specific props */
  isCameraActive?: boolean;
  onStartCamera?: () => void;
  /** For camera input, allows direct editing of the prompt text */
  promptText?: string;
  onPromptTextChange?: (text: string) => void;
}

export interface ChatInputAdditionalProps {
  attachmentButtonProps?: AttachmentButtonAdditionalProps;
  attachmentCircularActivityIndicatorProps?: CircularActivityIndicatorProps;
  /** Type of Pal being used, affects the input rendering */
  palType?: PalType;
  /** Camera-specific props */
  isCameraActive?: boolean;
  onStartCamera?: () => void;
  /** For camera input, allows direct editing of the prompt text */
  promptText?: string;
  onPromptTextChange?: (text: string) => void;
}

export type ChatInputProps = ChatInputTopLevelProps & ChatInputAdditionalProps;

/** Bottom bar input component with a text input, attachment and
 * send buttons inside. By default hides send button when text input is empty. */
export const ChatInput = observer(
  ({
    attachmentButtonProps,
    attachmentCircularActivityIndicatorProps,
    isAttachmentUploading,
    isStreaming = false,
    onAttachmentPress,
    onSendPress,
    onStopPress,
    onCancelEdit,
    onPalBtnPress,
    isStopVisible,
    sendButtonVisibilityMode,
    textInputProps,
    isPickerVisible,
    inputBackgroundColor,
    palType,
    isCameraActive = false,
    onStartCamera,
    promptText,
    onPromptTextChange,
  }: ChatInputProps) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const user = React.useContext(UserContext);
    const inputRef = React.useRef<TextInput>(null);
    const editBarHeight = React.useRef(new Animated.Value(0)).current;
    const iconRotation = React.useRef(new Animated.Value(0)).current;
    const activePalId = chatSessionStore.activePalId;
    const activePal = palStore.pals.find(pal => pal.id === activePalId);

    const hasActiveModel =
      palType === PalType.CAMERA
        ? !!modelStore.context
        : !!modelStore.activeModelId;

    // Use `defaultValue` if provided
    const [text, setText] = React.useState(textInputProps?.defaultValue ?? '');
    const isEditMode = chatSessionStore.isEditMode;

    const styles = createStyles({theme, isEditMode});

    // For camera input, use promptText if provided
    const value =
      (palType === PalType.CAMERA || palType === PalType.VIDEO) &&
      promptText !== undefined
        ? promptText
        : textInputProps?.value ?? text;

    React.useEffect(() => {
      if (isEditMode) {
        // Animate edit bar height
        Animated.spring(editBarHeight, {
          toValue: 28,
          useNativeDriver: false,
          friction: 8,
        }).start();
        // Focus input
        inputRef.current?.focus();
      } else {
        Animated.spring(editBarHeight, {
          toValue: 0,
          useNativeDriver: false,
          friction: 8,
        }).start();
        onCancelEdit?.();
      }
    }, [isEditMode, editBarHeight, onCancelEdit]);

    React.useEffect(() => {
      Animated.spring(iconRotation, {
        toValue: isPickerVisible ? 1 : 0,
        useNativeDriver: true,
        friction: 8,
      }).start();
    }, [isPickerVisible, iconRotation]);

    const handleChangeText = (newText: string) => {
      if (
        (palType === PalType.CAMERA || palType === PalType.VIDEO) &&
        onPromptTextChange
      ) {
        onPromptTextChange(newText);
      } else {
        setText(newText);
        textInputProps?.onChangeText?.(newText);
      }
    };

    const handleSend = () => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        onSendPress({text: trimmedValue, type: 'text'});
        setText('');
      }
    };

    const handleCancel = () => {
      setText('');
      onCancelEdit?.();
    };

    const isSendButtonVisible =
      !isStreaming &&
      !isStopVisible &&
      user &&
      (sendButtonVisibilityMode === 'always' || value.trim());

    const rotateInterpolate = iconRotation.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg'],
    });

    const isBackgroundLight = Color(inputBackgroundColor).isLight();
    const inputTextColor = isBackgroundLight ? '#333333' : '#DADDE6';

    return (
      <View style={styles.container}>
        <View style={styles.inputContainer}>
          {isEditMode && (
            <Animated.View
              style={[
                styles.editBar,
                {
                  height: editBarHeight,
                },
              ]}>
              <Text variant="labelSmall" style={styles.editBarText}>
                Editing message
              </Text>
              <IconButton
                icon="close"
                size={16}
                onPress={handleCancel}
                style={styles.editBarButton}
                iconColor={theme.colors.onSurfaceVariant}
              />
            </Animated.View>
          )}
          <View style={styles.inputRow}>
            {user &&
              (isAttachmentUploading ? (
                <CircularActivityIndicator
                  {...{
                    ...attachmentCircularActivityIndicatorProps,
                    color: theme.colors.onSurface,
                    style: styles.marginRight,
                  }}
                />
              ) : (
                !!onAttachmentPress && (
                  <AttachmentButton
                    {...unwrap(attachmentButtonProps)}
                    onPress={onAttachmentPress}
                  />
                )
              ))}
            <View style={styles.inputWrapper}>
              <TouchableOpacity
                style={[
                  styles.palBtn,
                  {
                    backgroundColor:
                      uiStore.colorScheme === 'dark'
                        ? theme.colors.inverseOnSurface
                        : theme.colors.inverseSurface,
                  },
                  activePal?.color && {
                    backgroundColor: activePal?.color?.[0],
                  },
                ]}
                onPress={onPalBtnPress}>
                <Animated.View
                  style={{
                    transform: [{rotate: rotateInterpolate}],
                  }}>
                  <ChevronUpIcon stroke={theme.colors.onSurface} />
                </Animated.View>
              </TouchableOpacity>
              <View style={styles.inputInnerContainer}>
                {activePal?.name && hasActiveModel && (
                  <Text
                    style={[
                      styles.palNameWrapper,
                      {
                        color: activePal.color?.[0],
                      },
                    ]}>
                    Pal:{' '}
                    <Text
                      style={[
                        styles.palName,
                        {
                          color: activePal.color?.[0],
                        },
                      ]}>
                      {activePal?.name}
                    </Text>
                  </Text>
                )}
                <TextInput
                  ref={inputRef}
                  multiline
                  key={inputTextColor}
                  placeholder={
                    palType === PalType.CAMERA
                      ? l10n.camera.promptPlaceholder
                      : palType === PalType.VIDEO
                      ? l10n.video.promptPlaceholder
                      : l10n.components.chatInput.inputPlaceholder
                  }
                  placeholderTextColor={inputTextColor}
                  underlineColorAndroid="transparent"
                  {...textInputProps}
                  style={[
                    styles.input,
                    textInputProps?.style,
                    {
                      color: inputTextColor,
                    },
                  ]}
                  onChangeText={handleChangeText}
                  value={value}
                  editable={
                    palType === PalType.CAMERA || palType === PalType.VIDEO
                      ? !isStreaming && !isCameraActive
                      : textInputProps?.editable !== false
                  }
                />
              </View>

              {/* Render different buttons based on pal type */}
              {palType === PalType.CAMERA || palType === PalType.VIDEO ? (
                // Camera/Video pal - show camera button or stop button
                !isCameraActive && !isStopVisible ? (
                  <TouchableOpacity
                    style={[
                      styles.cameraButton,
                      {backgroundColor: activePal?.color?.[0]},
                    ]}
                    onPress={onStartCamera}>
                    {palType === PalType.VIDEO ? (
                      <VideoRecorderIcon
                        width={20}
                        height={20}
                        stroke="white"
                        strokeWidth={2}
                      />
                    ) : (
                      <CameraIcon
                        width={20}
                        height={20}
                        stroke="white"
                        strokeWidth={2}
                      />
                    )}
                  </TouchableOpacity>
                ) : (
                  <StopButton
                    key={inputTextColor}
                    color={inputTextColor}
                    onPress={onStopPress}
                  />
                )
              ) : (
                // Standard chat - show send or stop button
                <>
                  {isSendButtonVisible ? (
                    <SendButton
                      key={inputTextColor}
                      color={inputTextColor}
                      onPress={handleSend}
                    />
                  ) : null}
                  {isStopVisible && (
                    <StopButton
                      key={inputTextColor}
                      color={inputTextColor}
                      onPress={onStopPress}
                    />
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  },
);
