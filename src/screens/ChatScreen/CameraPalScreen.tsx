import React, {useState, useCallback, useContext} from 'react';
import {View, StyleSheet, Alert} from 'react-native';
import {observer} from 'mobx-react';
import {ChatView, CameraView, Bubble} from '../../components';
import {L10nContext, UserContext} from '../../utils';
import {modelStore} from '../../store';
import {MessageType} from '../../utils/types';
import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';
import {user as defaultUser} from '../../utils/chat';
import {PalType} from '../../components/PalsSheets/types';

export const CameraPalScreen = observer(() => {
  const l10n = useContext(L10nContext);

  const contextUser = useContext(UserContext);
  const user = contextUser || defaultUser;

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImagePath, setCapturedImagePath] = useState<string | null>(
    null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [messages, setMessages] = useState<MessageType.Any[]>([]);
  const [responseText, setResponseText] = useState('');
  const [promptText, setPromptText] = useState(
    'What do you see in this image?',
  );

  // We'll use a direct approach instead of a custom render function

  // Handle starting the camera
  const handleStartCamera = useCallback(async () => {
    if (!modelStore.context) {
      Alert.alert(l10n.chat.modelNotLoaded, l10n.chat.pleaseLoadModel, [
        {
          text: l10n.common.ok,
        },
      ]);
      return;
    }

    // Check if multimodal is enabled
    try {
      const isEnabled = await modelStore.isMultimodalEnabled();
      if (!isEnabled) {
        Alert.alert(
          'Multimodal Not Enabled',
          'This model does not support image analysis. Please load a multimodal model.',
          [
            {
              text: l10n.common.ok,
            },
          ],
        );
        return;
      }

      setIsCameraActive(true);
    } catch (error) {
      console.error('Error checking multimodal capability:', error);
      Alert.alert('Error', 'Failed to check if model supports images.', [
        {
          text: l10n.common.ok,
        },
      ]);
    }
  }, [l10n]);

  // Handle stopping the camera
  const handleStopCamera = useCallback(() => {
    if (modelStore.inferencing) {
      modelStore.context?.stopCompletion();
    }
    setIsCameraActive(false);
    setCapturedImagePath(null);
  }, []);

  // Add a message to the chat
  const addMessage = useCallback((message: MessageType.Any) => {
    setMessages(prevMessages => [message, ...prevMessages]);
  }, []);

  // Handle image capture
  const handleImageCapture = useCallback(
    async (imagePath: string) => {
      setIsCameraActive(false);
      setCapturedImagePath(imagePath);
      setIsAnalyzing(true);
      setResponseText('');

      try {
        // Create a message with the image
        const imageMessage: MessageType.Image = {
          id: uuidv4(),
          author: user!,
          createdAt: Date.now(),
          type: 'image',
          uri: imagePath,
          name: 'Captured Image',
          size: 0,
        };

        // Add the image message to the chat
        addMessage(imageMessage);

        // Create a system message to indicate analysis is happening
        const systemMessage: MessageType.Text = {
          id: uuidv4(),
          createdAt: Date.now(),
          text: l10n.camera.analyzing,
          type: 'text',
          author: {
            id: 'system',
            firstName: 'System',
            lastName: '',
          },
        };

        addMessage(systemMessage);

        // Start the completion with the image using the user-editable prompt
        await modelStore.startImageCompletion({
          prompt: promptText,
          image_path: imagePath,
          onToken: token => {
            setResponseText(prev => prev + token);
          },
          onComplete: text => {
            // Create an AI message with the response
            const aiMessage: MessageType.Text = {
              id: uuidv4(),
              author: {
                id: 'ai',
                firstName: 'Lookie',
                lastName: '',
              },
              createdAt: Date.now(),
              text,
              type: 'text',
            };

            addMessage(aiMessage);
            setResponseText('');
            setIsAnalyzing(false);
          },
          onError: error => {
            console.error('Error processing image:', error);
            const errorMessage: MessageType.Text = {
              id: uuidv4(),
              createdAt: Date.now(),
              text: `Error analyzing image: ${error.message}`,
              type: 'text',
              author: {
                id: 'system',
                firstName: 'System',
                lastName: '',
              },
            };

            addMessage(errorMessage);
            setIsAnalyzing(false);
          },
        });
      } catch (error) {
        console.error('Error processing image:', error);
        const errorMessage: MessageType.Text = {
          id: uuidv4(),
          createdAt: Date.now(),
          text: `Error analyzing image: ${
            error instanceof Error ? error.message : String(error)
          }`,
          type: 'text',
          author: {
            id: 'system',
            firstName: 'System',
            lastName: '',
          },
        };

        addMessage(errorMessage);
        setIsAnalyzing(false);
      }
    },
    [user, l10n.camera.analyzing, addMessage, promptText],
  );

  // Custom bubble renderer to handle streaming response
  const renderBubble = useCallback(
    (props: any) => {
      // If we have a streaming response, show it
      if (isAnalyzing && responseText && props.message.author?.id === 'ai') {
        return (
          <Bubble
            {...props}
            message={{
              ...props.message,
              text: responseText,
            }}
          />
        );
      }

      // Otherwise, use the default bubble
      return <Bubble {...props} />;
    },
    [isAnalyzing, responseText],
  );

  // Render the camera or chat view based on state
  return (
    <UserContext.Provider value={user}>
      <View style={styles.container}>
        {isCameraActive ? (
          <CameraView
            onCapture={handleImageCapture}
            onClose={handleStopCamera}
          />
        ) : (
          <View style={styles.container}>
            <View style={styles.chatContainer}>
              <ChatView
                renderBubble={renderBubble}
                messages={messages}
                onSendPress={() => {}}
                onStopPress={() => modelStore.context?.stopCompletion()}
                user={user}
                isStopVisible={modelStore.inferencing}
                isThinking={modelStore.inferencing && !modelStore.isStreaming}
                isStreaming={modelStore.isStreaming && !!responseText}
                sendButtonVisibilityMode="editing"
                textInputProps={{
                  placeholder: isAnalyzing
                    ? l10n.camera.analyzing
                    : capturedImagePath
                    ? 'Image captured and analyzed'
                    : 'Tap the camera button to begin',
                  editable: !modelStore.isStreaming && !isCameraActive,
                  value: promptText,
                  onChangeText: setPromptText,
                }}
                inputProps={{
                  palType: PalType.CAMERA,
                  isCameraActive: isCameraActive,
                  onStartCamera: handleStartCamera,
                  promptText: promptText,
                  onPromptTextChange: setPromptText,
                }}
              />
            </View>
          </View>
        )}
      </View>
    </UserContext.Provider>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
});
