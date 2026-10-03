import * as React from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  Animated,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Linking,
  Platform,
} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {useCameraPermission} from 'react-native-vision-camera';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {observer} from 'mobx-react';
import {IconButton, Text} from 'react-native-paper';

import {hasVideoCapability} from '../../utils/pal-capabilities';

import {
  ChevronUpIcon,
  VideoRecorderIcon,
  PlusIcon,
  AtomIcon,
} from '../../assets/icons';

import {useTheme} from '../../hooks';
import {useVoiceConversation} from '../../hooks/useVoiceConversation';

import {createStyles} from './styles';

import {
  chatSessionStore,
  deepLinkStore,
  modelStore,
  palStore,
  startupSelectionStore,
  ttsStore,
  uiStore,
} from '../../store';

import {MessageType} from '../../utils/types';
import {L10nContext, UserContext} from '../../utils';
import {isLightColor, withOpacity} from '../../utils/colorUtils';
import {t} from '../../locales';
import {GenerationParameterMode} from '../../utils/completionTypes';

import {SendButton, StopButton, Menu, VoiceChip} from '..';

export interface ChatInputTopLevelProps {
  /** Whether the AI is currently streaming tokens */
  isStreaming?: boolean;
  /** Will be called on {@link SendButton} tap. Has {@link MessageType.PartialText} which can
   * be transformed to {@link MessageType.Text} and added to the messages list. */
  onSendPress: (message: MessageType.PartialText) => Promise<unknown> | void;
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
  /** External control for selected images (for edit mode) */
  defaultImages?: string[];
  onDefaultImagesChange?: (images: string[]) => void;

  /** Camera-specific props */
  isCameraActive?: boolean;
  onStartCamera?: () => void;
  /** For camera input, allows direct editing of the prompt text */
  promptText?: string;
  onPromptTextChange?: (text: string) => void;
  /** Whether to show the image upload button */
  showImageUpload?: boolean;
  isVisionEnabled?: boolean;
  /** Whether this mounted input is the active foreground chat. */
  isDictationEligible?: boolean;
  /** Identity used to discard speech results after chat/edit target changes. */
  dictationContextKey?: string;
  /** Whether to show the thinking toggle button */
  showThinkingToggle?: boolean;
  /** Whether thinking mode is currently enabled */
  isThinkingEnabled?: boolean;
  /** Callback when thinking toggle is pressed */
  onThinkingToggle?: (enabled: boolean) => void;
  /** Omission/inheritance policy for thinking. Undefined preserves legacy behavior. */
  thinkingMode?: GenerationParameterMode;
  /** Updates thinking policy while retaining the explicit On/Off value. */
  onThinkingModeChange?: (
    mode: GenerationParameterMode,
    enabled?: boolean,
  ) => void;
  /** Whether the model supports graded reasoning effort (axis 2) */
  supportsEffort?: boolean;
  /** The graded effort value set, e.g. ['low','medium','high'] */
  effortValues?: string[];
  /** Currently selected reasoning effort (when graded) */
  reasoningEffort?: string;
  /** Callback to cycle the graded effort state (off -> values -> off) */
  onEffortCycle?: () => void;
  /** Omission/inheritance policy for reasoning effort. */
  reasoningEffortMode?: GenerationParameterMode;
  /** Updates effort policy while retaining the explicit level. */
  onReasoningEffortModeChange?: (
    mode: GenerationParameterMode,
    effort?: string,
  ) => void;
}

export interface ChatInputAdditionalProps {
  /** Camera-specific props */
  isCameraActive?: boolean;
  onStartCamera?: () => void;
  /** For camera input, allows direct editing of the prompt text */
  promptText?: string;
  onPromptTextChange?: (text: string) => void;
  /** Whether to show the image upload button */
  showImageUpload?: boolean;
  /** Whether to show the thinking toggle button */
  showThinkingToggle?: boolean;
  /** Whether thinking mode is currently enabled */
  isThinkingEnabled?: boolean;
  /** Callback when thinking toggle is pressed */
  onThinkingToggle?: (enabled: boolean) => void;
  thinkingMode?: GenerationParameterMode;
  onThinkingModeChange?: (
    mode: GenerationParameterMode,
    enabled?: boolean,
  ) => void;
  /** Whether the model supports graded reasoning effort (axis 2) */
  supportsEffort?: boolean;
  /** The graded effort value set, e.g. ['low','medium','high'] */
  effortValues?: string[];
  /** Currently selected reasoning effort (when graded) */
  reasoningEffort?: string;
  /** Callback to cycle the graded effort state (off -> values -> off) */
  onEffortCycle?: () => void;
  reasoningEffortMode?: GenerationParameterMode;
  onReasoningEffortModeChange?: (
    mode: GenerationParameterMode,
    effort?: string,
  ) => void;
}

export type ChatInputProps = ChatInputTopLevelProps & ChatInputAdditionalProps;

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

/** Bottom bar input component with a text input, attachment and
 * send buttons inside. By default hides send button when text input is empty. */
export const ChatInput = observer(
  ({
    isStreaming = false,
    onSendPress,
    onStopPress,
    onCancelEdit,
    onPalBtnPress,
    isStopVisible,
    sendButtonVisibilityMode,
    textInputProps,
    isPickerVisible,
    inputBackgroundColor,
    isCameraActive = false,
    onStartCamera,
    promptText,
    onPromptTextChange,
    showImageUpload = false,
    isVisionEnabled = false,
    isDictationEligible = true,
    dictationContextKey = 'chat',
    defaultImages,
    onDefaultImagesChange,
    showThinkingToggle = false,
    isThinkingEnabled = false,
    onThinkingToggle,
    thinkingMode,
    onThinkingModeChange,
    supportsEffort = false,
    effortValues = [],
    reasoningEffort,
    onEffortCycle,
    reasoningEffortMode,
    onReasoningEffortModeChange,
  }: ChatInputProps) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const user = React.useContext(UserContext);
    const inputRef = React.useRef<TextInput>(null);
    const editBarHeight = React.useRef(new Animated.Value(0)).current;
    const iconRotation = React.useRef(new Animated.Value(0)).current;
    const activePalId = chatSessionStore.activePalId;
    const currentActivePal = palStore.pals.find(pal => pal.id === activePalId);

    // Camera permission hook from react-native-vision-camera
    const {hasPermission, requestPermission} = useCameraPermission();

    const hasActiveModel = !!modelStore.activeModelId;

    // Use `defaultValue` if provided
    const [text, setText] = React.useState(textInputProps?.defaultValue ?? '');
    // State for selected images - use external control when provided
    const [internalSelectedImages, setInternalSelectedImages] = React.useState<
      string[]
    >([]);
    const selectedImages = defaultImages ?? internalSelectedImages;
    const setSelectedImages =
      onDefaultImagesChange ?? setInternalSelectedImages;
    // State for image upload menu
    const [showImageUploadMenu, setShowImageUploadMenu] = React.useState(false);
    // State for showing "model not loaded" helper text
    const [showModelWarning, setShowModelWarning] = React.useState(false);
    const isEditMode = chatSessionStore.isEditMode;

    const styles = createStyles({theme, isEditMode});

    // For camera input, use promptText if provided
    const isVideoCapable =
      currentActivePal && hasVideoCapability(currentActivePal);
    const value =
      isVideoCapable && promptText !== undefined
        ? promptText
        : (textInputProps?.value ?? text);
    const onInputChangeText = textInputProps?.onChangeText;

    const handleChangeText = React.useCallback(
      (newText: string) => {
        if (isVideoCapable && onPromptTextChange) {
          onPromptTextChange(newText);
        } else {
          setText(newText);
          onInputChangeText?.(newText);
        }
      },
      [isVideoCapable, onInputChangeText, onPromptTextChange],
    );

    const handleConversationSend = React.useCallback(
      (message: MessageType.PartialText) =>
        Promise.resolve(onSendPress(message)),
      [onSendPress],
    );
    const handleStopConversationGeneration = React.useCallback(() => {
      onStopPress?.();
    }, [onStopPress]);
    const handleOpenVoiceSetup = React.useCallback(() => {
      ttsStore.openSetupSheet();
    }, []);
    const conversation = useVoiceConversation({
      contextKey: dictationContextKey,
      recognitionEnabled:
        isDictationEligible &&
        !isStreaming &&
        !isStopVisible &&
        !isCameraActive &&
        !isVideoCapable,
      onSendTranscript: handleConversationSend,
      onStopGeneration: handleStopConversationGeneration,
      onOpenVoiceSetup: handleOpenVoiceSetup,
    });
    const dictation = conversation.recognition;
    const dictationActive = conversation.active;
    const {clearError: clearDictationError, requestModelDownload} = dictation;
    const speechInputL10n = l10n.components.chatInput.speechInput;
    const pendingVoiceRequestId =
      deepLinkStore.pendingVoiceConversationRequestId;
    const startupSelectionReady =
      startupSelectionStore.restoreAttempted &&
      !startupSelectionStore.isRestoring;

    React.useEffect(() => {
      if (pendingVoiceRequestId === null) {
        return;
      }
      if (conversation.active) {
        deepLinkStore.consumeVoiceConversationRequest(pendingVoiceRequestId);
        return;
      }
      if (!isDictationEligible) {
        return;
      }
      if (
        isStreaming ||
        isStopVisible ||
        isCameraActive ||
        isVideoCapable ||
        !startupSelectionReady ||
        !modelStore.engine ||
        modelStore.isContextLoading
      ) {
        deepLinkStore.consumeVoiceConversationRequest(pendingVoiceRequestId);
        return;
      }
      if (value.trim() || selectedImages.length > 0) {
        handleChangeText('');
        setSelectedImages([]);
        return;
      }

      conversation.start();
      deepLinkStore.consumeVoiceConversationRequest(pendingVoiceRequestId);
    }, [
      conversation,
      handleChangeText,
      isCameraActive,
      isDictationEligible,
      isStreaming,
      isStopVisible,
      isVideoCapable,
      pendingVoiceRequestId,
      selectedImages,
      setSelectedImages,
      startupSelectionReady,
      value,
    ]);

    React.useEffect(() => {
      if (pendingVoiceRequestId === null || !isDictationEligible) {
        return;
      }
      return () => {
        deepLinkStore.consumeVoiceConversationRequest(pendingVoiceRequestId);
      };
    }, [isDictationEligible, pendingVoiceRequestId]);

    React.useEffect(() => {
      if (!dictation.errorCode) {
        return;
      }
      const speech = speechInputL10n;
      const messages: Record<string, string> = {
        UNSUPPORTED_ANDROID: speech.unsupportedAndroid,
        ON_DEVICE_UNAVAILABLE: speech.unavailable,
        LANGUAGE_UNSUPPORTED: speech.languageUnsupported,
        LANGUAGE_UNAVAILABLE: speech.languageUnavailable,
        LANGUAGE_PENDING: speech.languagePending,
        PERMISSION_DENIED: speech.permissionDenied,
        PERMISSION_BLOCKED: speech.permissionBlocked,
        NO_MATCH: speech.noMatch,
        NO_SPEECH: speech.noSpeech,
        TIMEOUT: speech.timeout,
        RESULT_TIMEOUT: speech.timeout,
        AUDIO_ERROR: speech.audioError,
        RECOGNIZER_BUSY: speech.busy,
        UNEXPECTED_NETWORK: speech.offlineFailure,
        NATIVE_MODULE_ERROR: speech.unavailable,
      };
      const buttons: Array<{text: string; onPress?: () => void}> = [];
      if (
        dictation.errorCode === 'LANGUAGE_DOWNLOAD_REQUIRED' ||
        dictation.errorCode === 'LANGUAGE_UNAVAILABLE'
      ) {
        buttons.push({
          text: speech.download,
          onPress: requestModelDownload,
        });
      }
      if (dictation.errorCode === 'PERMISSION_BLOCKED') {
        buttons.push({
          text: speech.openSettings,
          onPress: Linking.openSettings,
        });
      }
      buttons.push({text: l10n.common.ok, onPress: clearDictationError});
      Alert.alert(
        speech.errorTitle,
        dictation.errorCode === 'LANGUAGE_DOWNLOAD_REQUIRED'
          ? speech.languageDownloadRequired
          : (messages[dictation.errorCode] ?? speech.failed),
        buttons,
        {onDismiss: clearDictationError},
      );
    }, [
      clearDictationError,
      dictation.errorCode,
      l10n.common.ok,
      requestModelDownload,
      speechInputL10n,
    ]);

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

    const handleSend = () => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        // Check if model is loaded before sending
        if (!hasActiveModel) {
          // Trigger haptic feedback to indicate the action is blocked
          ReactNativeHapticFeedback.trigger(
            'notificationWarning',
            hapticOptions,
          );
          // Show warning helper text
          setShowModelWarning(true);
          // Auto-hide after 3 seconds
          setTimeout(() => setShowModelWarning(false), 3000);
          return;
        }

        // Include imageUris in the message object
        onSendPress({
          text: trimmedValue,
          type: 'text',
          imageUris: selectedImages.length > 0 ? selectedImages : undefined,
        });
        setText('');
        // Clear selected images after sending
        setSelectedImages([]);
      }
    };

    const handleConversationPress = () => {
      if (pendingVoiceRequestId !== null) {
        deepLinkStore.consumeVoiceConversationRequest(pendingVoiceRequestId);
      }
      if (conversation.active) {
        conversation.stop();
        return;
      }
      if (value.trim() || selectedImages.length > 0 || isEditMode) {
        Alert.alert(
          speechInputL10n.conversationUnavailableTitle,
          speechInputL10n.conversationNeedsEmptyComposer,
        );
        return;
      }
      if (!hasActiveModel) {
        ReactNativeHapticFeedback.trigger('notificationWarning', hapticOptions);
        setShowModelWarning(true);
        setTimeout(() => setShowModelWarning(false), 3000);
        return;
      }
      conversation.start();
    };

    const handleGenerationStop = () => {
      if (conversation.active) {
        conversation.stop(false);
      }
      onStopPress?.();
    };

    // Handle plus button press to show image upload menu
    const handlePlusButtonPress = () => {
      setShowImageUploadMenu(true);
    };

    // Need to figure this out:
    // Handle taking a photo with the camera using react-native-image-picker
    // but with permission checking from react-native-vision-camera
    const handleTakePhoto = async () => {
      try {
        if (!hasPermission) {
          const permissionResult = await requestPermission();
          if (!permissionResult) {
            Alert.alert(
              l10n.camera.permissionTitle,
              l10n.camera.permissionMessage,
            );
            setShowImageUploadMenu(false);
            return;
          }
        }

        // Disable auto-release during camera operation
        // this is only needed on Android.
        modelStore.disableAutoRelease('camera-photo');

        const result = await launchCamera({
          mediaType: 'photo',
          quality: 0.8,
        });

        if (result.errorCode === 'camera_unavailable') {
          Alert.alert(l10n.camera.errorTitle, l10n.camera.noDevice);
        } else if (result.errorCode) {
          Alert.alert(
            l10n.errors.cameraErrorTitle,
            l10n.errors.cameraErrorMessage,
          );
        } else if (
          result.assets &&
          result.assets.length > 0 &&
          result.assets[0].uri
        ) {
          const newImages = [...selectedImages, result.assets[0].uri];
          setSelectedImages(newImages);
        }
        setShowImageUploadMenu(false);
      } catch (error) {
        console.error('Error taking photo:', error);
        Alert.alert(
          l10n.errors.cameraErrorTitle,
          l10n.errors.cameraErrorMessage,
        );
      } finally {
        // Re-enable auto-release after camera operation
        modelStore.enableAutoRelease('camera-photo');
      }
    };

    // Handle selecting images from the gallery
    const handleSelectImages = async () => {
      try {
        // Disable auto-release during gallery operation
        // this is only needed on Android.
        modelStore.disableAutoRelease('image-gallery');

        const result = await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 5, // Allow multiple images
          quality: 0.8,
        });

        if (result.assets && result.assets.length > 0) {
          const newUris = result.assets
            .filter(asset => asset.uri)
            .map(asset => asset.uri as string);

          if (newUris.length > 0) {
            const newImages = [...selectedImages, ...newUris];
            setSelectedImages(newImages);
          }
        }
        setShowImageUploadMenu(false);
      } catch (error) {
        console.error('Error selecting images:', error);
        Alert.alert(
          l10n.errors.galleryErrorTitle,
          l10n.errors.galleryErrorMessage,
        );
      } finally {
        // Re-enable auto-release after gallery operation
        modelStore.enableAutoRelease('image-gallery');
      }
    };

    // Remove an image from the selection
    const handleRemoveImage = (index: number) => {
      const newImages = [...selectedImages];
      newImages.splice(index, 1);
      setSelectedImages(newImages);
    };

    const handleCancel = () => {
      setText('');
      onCancelEdit?.();
    };

    const isSendButtonVisible =
      !isStreaming &&
      !isStopVisible &&
      user &&
      !isVideoCapable && // Hide send button for video-capable pals
      (sendButtonVisibilityMode === 'always' || value.trim());
    const isSendButtonEnabled = value.trim().length > 0 && hasActiveModel;
    const sendButtonOpacity = isSendButtonEnabled ? 1 : 0.4;

    const rotateInterpolate = iconRotation.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg'],
    });

    const onSurfaceColor = currentActivePal?.color?.[0] || theme.colors.text;
    const hasDarkPalSurface =
      !!currentActivePal?.color &&
      !!inputBackgroundColor &&
      !isLightColor(inputBackgroundColor);
    const onSurfaceColorVariant = hasDarkPalSurface
      ? withOpacity(onSurfaceColor, 0.9)
      : onSurfaceColor + '55';
    const disabledOnSurfaceColor = onSurfaceColor + '55';
    // // Plus button state
    const isPlusButtonEnabled =
      !isStreaming && !conversation.active && isVisionEnabled;
    const plusColor = isPlusButtonEnabled
      ? onSurfaceColor
      : disabledOnSurfaceColor;

    // Localize the current graded-effort tier through the same table the
    // model-settings chips use; fall back to the raw token for an unlisted one.
    const effortLevelLabels = l10n.components.modelSettingsSheet.effortLevels;
    const localizedEffort =
      reasoningEffort && reasoningEffort in effortLevelLabels
        ? effortLevelLabels[reasoningEffort as keyof typeof effortLevelLabels]
        : reasoningEffort;
    const thinkingUsesProviderDefault = thinkingMode === 'omit';
    const thinkingIsInherited = thinkingMode === 'inherit';
    const effortUsesProviderDefault = reasoningEffortMode === 'omit';
    const thinkingLabel = thinkingUsesProviderDefault
      ? l10n.components.chatInput.thinkingToggle.providerDefault
      : thinkingIsInherited
        ? l10n.components.chatInput.thinkingToggle.inherited
        : supportsEffort &&
            isThinkingEnabled &&
            (effortUsesProviderDefault || reasoningEffort)
          ? effortUsesProviderDefault
            ? l10n.components.chatInput.thinkingToggle.effortDefault
            : localizedEffort
          : isThinkingEnabled
            ? l10n.components.chatInput.thinkingToggle.on
            : l10n.components.chatInput.thinkingToggle.off;

    const handleThinkingPress = () => {
      if (supportsEffort && effortValues.length > 0) {
        if (onReasoningEffortModeChange && effortUsesProviderDefault) {
          onReasoningEffortModeChange('send', effortValues[0]);
          return;
        }
        onEffortCycle?.();
        return;
      }
      if (onThinkingModeChange) {
        if (thinkingUsesProviderDefault || thinkingIsInherited) {
          onThinkingModeChange('send', true);
        } else if (isThinkingEnabled) {
          onThinkingModeChange('send', false);
        } else {
          onThinkingModeChange('omit');
        }
        return;
      }
      onThinkingToggle?.(!isThinkingEnabled);
    };

    return (
      <View style={styles.container}>
        <View style={styles.inputContainer}>
          {/* Edit Bar (when in edit mode) */}
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

          {/* Image Preview Section */}
          {selectedImages.length > 0 && (
            <View
              style={[
                styles.imagePreviewContainer,
                isEditMode && styles.imagePreviewContainerEditMode,
              ]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.imageScrollContent}>
                {selectedImages.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.imageContainer}>
                    <Image
                      source={{uri}}
                      style={styles.previewImage}
                      accessibilityLabel={`Image preview ${index + 1} of ${
                        selectedImages.length
                      }`}
                    />
                    <IconButton
                      icon="close-circle"
                      size={20}
                      iconColor={theme.colors.error}
                      style={styles.removeImageButton}
                      onPress={() => handleRemoveImage(index)}
                      accessibilityLabel={`Remove image ${index + 1}`}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Text Input Area (Top Row) */}
          <View
            style={[
              styles.textInputArea,
              {
                paddingTop: isEditMode
                  ? selectedImages.length > 0
                    ? 8 // Reduced padding when images present in edit mode
                    : 48 // Edit bar height (28px) + normal padding (20px)
                  : selectedImages.length > 0
                    ? 0
                    : 20,
              },
            ]}>
            {/* Subtle Prompt Label for Video Pals */}
            {isVideoCapable && (
              <Text
                variant="labelSmall"
                style={[styles.promptLabel, {color: onSurfaceColorVariant}]}>
                {l10n.palsScreen.prompt}:
              </Text>
            )}
            <TextInput
              ref={inputRef}
              multiline
              placeholder={
                isVideoCapable
                  ? l10n.video.promptPlaceholder
                  : l10n.components.chatInput.inputPlaceholder
              }
              placeholderTextColor={onSurfaceColorVariant}
              underlineColorAndroid="transparent"
              {...textInputProps}
              style={[
                styles.input,
                textInputProps?.style,
                {
                  color: onSurfaceColor,
                },
                isVideoCapable && styles.inputWithLabel,
              ]}
              onChangeText={handleChangeText}
              value={value}
              editable={
                isVideoCapable
                  ? !isStreaming && !isCameraActive
                  : textInputProps?.editable !== false && !conversation.active
              }
              testID="chat-input"
              accessibilityLabel="Message input"
            />
          </View>

          {/* Control Bar (Bottom Row) */}
          <View style={styles.controlBar}>
            {/* Left Controls */}
            <View style={styles.leftControls}>
              {/* Plus Button for Image Upload (only for regular chat) */}
              {showImageUpload && !isVideoCapable && (
                <Menu
                  visible={showImageUploadMenu}
                  onDismiss={() => setShowImageUploadMenu(false)}
                  anchorPosition="top"
                  anchor={
                    <TouchableOpacity
                      style={styles.plusButton}
                      disabled={!isPlusButtonEnabled}
                      onPress={
                        isPlusButtonEnabled ? handlePlusButtonPress : () => {}
                      }
                      accessibilityLabel="Add image"
                      accessibilityRole="button">
                      <PlusIcon width={20} height={20} stroke={plusColor} />
                    </TouchableOpacity>
                  }>
                  <Menu.Item
                    label={l10n.camera?.takePhoto || 'Camera'}
                    icon="camera"
                    onPress={handleTakePhoto}
                  />
                  <Menu.Item
                    label={l10n.common?.gallery || 'Gallery'}
                    icon="image"
                    onPress={handleSelectImages}
                  />
                </Menu>
              )}

              {/* Pal Selector */}
              <View style={styles.palSelector}>
                <TouchableOpacity
                  style={[
                    styles.palBtn,
                    {
                      backgroundColor:
                        uiStore.colorScheme === 'dark'
                          ? theme.colors.inverseOnSurface
                          : theme.colors.inverseSurface,
                    },
                    currentActivePal?.color && {
                      backgroundColor: currentActivePal?.color?.[0],
                    },
                  ]}
                  onPress={onPalBtnPress}
                  accessibilityLabel="Select Pal"
                  accessibilityRole="button">
                  <Animated.View
                    style={{
                      transform: [{rotate: rotateInterpolate}],
                    }}>
                    <ChevronUpIcon stroke={inputBackgroundColor} />
                  </Animated.View>
                </TouchableOpacity>

                {/* Pal Name Display */}
                {currentActivePal?.name && hasActiveModel && (
                  <Text
                    style={[
                      styles.palNameCompact,
                      {
                        color: onSurfaceColor,
                      },
                    ]}>
                    Pal:{' '}
                    <Text
                      style={[
                        styles.palNameValueCompact,
                        {
                          color: onSurfaceColor,
                        },
                      ]}>
                      {currentActivePal?.name}
                    </Text>
                  </Text>
                )}
              </View>

              {/* Thinking Toggle Button. Graded models (axis-2) cycle
                  off -> low -> medium -> high; effortless models toggle
                  on/off. The label shows the current effort when graded. */}
              {showThinkingToggle && !isCameraActive && (
                <TouchableOpacity
                  testID="thinking-toggle"
                  style={[
                    styles.thinkingToggleLeft,
                    isThinkingEnabled && {backgroundColor: onSurfaceColor},
                    {borderColor: onSurfaceColorVariant},
                  ]}
                  onPress={handleThinkingPress}
                  accessibilityLabel={
                    thinkingUsesProviderDefault
                      ? l10n.components.chatInput.thinkingToggle
                          .useExplicitThinking
                      : thinkingIsInherited
                        ? l10n.components.chatInput.thinkingToggle
                            .useExplicitThinking
                        : supportsEffort && effortValues.length > 0
                          ? t(
                              l10n.components.chatInput.thinkingToggle
                                .cycleEffort,
                              {
                                level: localizedEffort ?? '',
                              },
                            )
                          : isThinkingEnabled
                            ? l10n.components.chatInput.thinkingToggle
                                .disableThinking
                            : l10n.components.chatInput.thinkingToggle
                                .enableThinking
                  }
                  accessibilityRole="button">
                  <AtomIcon
                    width={14}
                    height={14}
                    stroke={
                      isThinkingEnabled
                        ? inputBackgroundColor
                        : onSurfaceColorVariant
                    }
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.thinkingToggleText,
                      isThinkingEnabled
                        ? {color: inputBackgroundColor}
                        : {color: onSurfaceColorVariant},
                    ]}>
                    {thinkingMode || reasoningEffortMode
                      ? thinkingLabel
                      : supportsEffort && isThinkingEnabled && reasoningEffort
                        ? localizedEffort
                        : l10n.components.chatInput.thinkingToggle.thinkText}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Right Controls */}
            <View style={styles.rightControls}>
              {Platform.OS === 'android' && !isVideoCapable && (
                <View style={styles.dictationControls}>
                  <IconButton
                    icon={
                      conversation.phase === 'finishing'
                        ? 'progress-clock'
                        : conversation.active
                          ? 'stop-circle'
                          : 'microphone'
                    }
                    size={20}
                    iconColor={hasDarkPalSurface ? onSurfaceColor : undefined}
                    disabled={
                      !conversation.active &&
                      (!isDictationEligible ||
                        !hasActiveModel ||
                        isStreaming ||
                        !!isStopVisible ||
                        isCameraActive)
                    }
                    onPress={handleConversationPress}
                    accessibilityLabel={
                      conversation.active
                        ? speechInputL10n.stopConversation
                        : speechInputL10n.startConversation
                    }
                    accessibilityState={{
                      selected: conversation.active,
                      busy:
                        conversation.phase === 'starting' ||
                        conversation.phase === 'finishing' ||
                        conversation.phase === 'responding',
                    }}
                    testID="dictation-button"
                  />
                  {dictationActive && (
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.dictationStatus,
                        hasDarkPalSurface && {
                          color: onSurfaceColorVariant,
                        },
                      ]}
                      testID="dictation-status">
                      {dictation.partialText ||
                        (conversation.phase === 'finishing'
                          ? speechInputL10n.finishing
                          : conversation.phase === 'responding'
                            ? speechInputL10n.responding
                            : conversation.phase === 'starting'
                              ? speechInputL10n.starting
                              : speechInputL10n.listening)}
                    </Text>
                  )}
                </View>
              )}
              {/* Helper text for model not loaded */}
              {showModelWarning && !hasActiveModel && (
                <View style={styles.helperTextContainer}>
                  <Text variant="bodySmall" style={styles.helperText}>
                    {l10n.chat.cannotSendWithoutModel}
                  </Text>
                </View>
              )}

              {/* Voice chip (TTS) — always present so users can stop
                  audio independently of text generation. Self-gates:
                  returns null when TTS is unavailable. */}
              <VoiceChip
                collapsedForegroundColor={
                  hasDarkPalSurface ? onSurfaceColorVariant : undefined
                }
              />

              {/* Send/Stop Button */}
              {isStopVisible ? (
                <StopButton
                  color={onSurfaceColor}
                  onPress={handleGenerationStop}
                />
              ) : isVideoCapable && !isCameraActive ? (
                /* Compact Start Video Button for Video Pals */
                <TouchableOpacity
                  style={[
                    styles.compactVideoButton,
                    {
                      backgroundColor: onSurfaceColor,
                    },
                  ]}
                  onPress={onStartCamera}
                  accessibilityLabel="Start video analysis"
                  accessibilityRole="button">
                  <VideoRecorderIcon
                    width={16}
                    height={16}
                    stroke="white"
                    strokeWidth={2}
                  />
                  <Text style={styles.compactButtonText}>
                    {l10n.video.startCamera}
                  </Text>
                </TouchableOpacity>
              ) : (
                isSendButtonVisible &&
                !conversation.active && (
                  <View style={{opacity: sendButtonOpacity}}>
                    <SendButton color={onSurfaceColor} onPress={handleSend} />
                  </View>
                )
              )}
            </View>
          </View>
        </View>
      </View>
    );
  },
);
