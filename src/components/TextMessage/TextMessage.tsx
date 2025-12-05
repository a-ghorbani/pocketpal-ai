import * as React from 'react';
import {
  Linking,
  Text,
  View,
  Image,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {IconButton} from 'react-native-paper';

import ParsedText from 'react-native-parsed-text';
import {
  LinkPreview,
  PreviewData,
  REGEX_LINK,
} from '@flyerhq/react-native-link-preview';

import {useTheme} from '../../hooks';

import {styles} from './styles';
import {MarkdownView} from '../MarkdownView';

import {MessageType} from '../../utils/types';
import {
  excludeDerivedMessageProps,
  getUserName,
  UserContext,
} from '../../utils';

export interface TextMessageTopLevelProps {
  /** @see {@link LinkPreviewProps.onPreviewDataFetched} */
  onPreviewDataFetched?: ({
    message,
    previewData,
  }: {
    message: MessageType.Text;
    previewData: PreviewData;
  }) => void;
  /** Enables link (URL) preview */
  usePreviewData?: boolean;
}

export interface TextMessageProps extends TextMessageTopLevelProps {
  enableAnimation?: boolean;
  message: MessageType.DerivedText;
  messageWidth: number;
  showName: boolean;
}

export const TextMessage = ({
  enableAnimation,
  message,
  messageWidth,
  onPreviewDataFetched,
  showName,
  usePreviewData,
}: TextMessageProps) => {
  const theme = useTheme();
  const user = React.useContext(UserContext);
  const [previewData, setPreviewData] = React.useState(message.previewData);
  const [selectedImageIndex, setSelectedImageIndex] = React.useState<
    number | null
  >(null);

  const {
    descriptionText,
    headerText,
    titleText,
    text,
    textContainer,
    imageContainer,
    imageThumbnail,
    imageContent,
    imagePreviewModal,
    imagePreviewCloseButton,
    imagePreviewContent,
  } = styles({
    message,
    theme,
    user,
  });

  // Extract imageUris from the message if available
  const imageUris = (message as any).imageUris || [];
  const hasImages = imageUris && imageUris.length > 0;

  const handleEmailPress = (email: string) => {
    try {
      Linking.openURL(`mailto:${email}`);
    } catch {}
  };

  const handlePreviewDataFetched = (data: PreviewData) => {
    setPreviewData(data);
    onPreviewDataFetched?.({
      // It's okay to cast here since we know it is a text message
      // type-coverage:ignore-next-line
      message: excludeDerivedMessageProps(message) as MessageType.Text,
      previewData: data,
    });
  };

  const handleUrlPress = (url: string) => {
    const uri = url.toLowerCase().startsWith('http') ? url : `https://${url}`;

    Linking.openURL(uri);
  };

  const renderPreviewDescription = (description: string) => {
    return (
      <Text numberOfLines={3} style={descriptionText}>
        {description}
      </Text>
    );
  };

  const renderPreviewHeader = (header: string) => {
    return (
      <Text numberOfLines={1} style={headerText}>
        {header}
      </Text>
    );
  };

  const renderPreviewText = (previewText: string) => {
    return (
      <ParsedText
        accessibilityRole="link"
        parse={[
          {
            onPress: handleEmailPress,
            style: [text, {textDecorationLine: 'underline'}],
            type: 'email',
          },
          {
            onPress: handleUrlPress,
            pattern: REGEX_LINK,
            style: [text, {textDecorationLine: 'underline'}],
          },
        ]}
        style={text}>
        {previewText}
      </ParsedText>
    );
  };

  const renderPreviewTitle = (title: string) => {
    return (
      <Text numberOfLines={2} style={titleText}>
        {title}
      </Text>
    );
  };

  // Render image thumbnails
  const renderImages = () => {
    if (!hasImages) {
      return null;
    }

    return (
      <View style={imageContainer}>
        {imageUris.map((uri: string, index: number) => (
          <TouchableOpacity
            key={index}
            style={imageThumbnail}
            onPress={() => setSelectedImageIndex(index)}>
            <Image source={{uri}} style={imageContent} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Render image preview modal
  const renderImagePreview = () => {
    if (selectedImageIndex === null) {
      return null;
    }

    return (
      <Modal
        visible={selectedImageIndex !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImageIndex(null)}>
        <View style={imagePreviewModal}>
          <IconButton
            icon="close"
            size={24}
            iconColor="white"
            style={imagePreviewCloseButton}
            onPress={() => setSelectedImageIndex(null)}
          />
          <Image
            source={{uri: imageUris[selectedImageIndex]}}
            style={imagePreviewContent}
            resizeMode="contain"
          />
        </View>
      </Modal>
    );
  };

  return (
    <>
      {usePreviewData &&
      !!onPreviewDataFetched &&
      REGEX_LINK.test(message.text.toLowerCase()) ? (
        <LinkPreview
          containerStyle={{
            width: previewData?.image ? messageWidth : undefined,
          }}
          enableAnimation={enableAnimation}
          header={showName ? getUserName(message.author) : undefined}
          onPreviewDataFetched={handlePreviewDataFetched}
          previewData={previewData}
          renderDescription={renderPreviewDescription}
          renderHeader={renderPreviewHeader}
          renderText={renderPreviewText}
          renderTitle={renderPreviewTitle}
          text={message.text}
          textContainerStyle={textContainer}
          touchableWithoutFeedbackProps={{
            accessibilityRole: undefined,
            accessible: false,
            disabled: true,
          }}
        />
      ) : (
        <View style={textContainer}>
          {
            // Tested inside the link preview
            /* istanbul ignore next */ showName
              ? renderPreviewHeader(getUserName(message.author))
              : null
          }

          {/* Render images above the text */}
          {renderImages()}

          <MarkdownView
            markdownText={message.text.trim()}
            maxMessageWidth={messageWidth}
            selectable={false}
            reasoningContent={
              message.metadata?.completionResult?.reasoning_content ||
              message.metadata?.partialCompletionResult?.reasoning_content
            }
          />

          {/*Platform.OS === 'ios' ? (
            <TextInput
              multiline
              editable={false}
              style={[
                text,
                {
                  lineHeight: undefined,
                },
              ]}>
              {message.text.trim()}
            </TextInput>
          ) : (
            <Text selectable={true} style={text}>
              {message.text}
            </Text>
          )*/}
        </View>
      )}

      {/* Image preview modal */}
      {renderImagePreview()}
    </>
  );
};
