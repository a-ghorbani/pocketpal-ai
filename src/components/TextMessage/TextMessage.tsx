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

import {AgentStep, MessageType} from '../../utils/types';
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
  /**
   * Either a legacy `Text` row, or an `AssistantTurn` row when paired
   * with a `step`. The component reads `author` / `previewData` /
   * `metadata` from `message` regardless; `text` is only consulted
   * when `step` is undefined.
   */
  message: MessageType.DerivedText | MessageType.DerivedAssistantTurn;
  messageWidth: number;
  showName: boolean;
  /**
   * When provided, the component renders this step's `content` and
   * `reasoningContent` in place of `message.text`. Set by the
   * AssistantTurn renderer for each step within a turn — same
   * component, per-step content.
   */
  step?: AgentStep;
}

export const TextMessage = ({
  enableAnimation,
  message,
  messageWidth,
  onPreviewDataFetched,
  showName,
  usePreviewData,
  step,
}: TextMessageProps) => {
  // For AssistantTurn rendering, the per-step `content` is the
  // authoritative source. For legacy `Text` messages, fall back to
  // `message.text`. Same fallback for `reasoningContent`.
  const visibleText: string = step
    ? step.content ?? ''
    : 'text' in message
      ? message.text
      : '';
  const reasoningContent: string | undefined = step
    ? step.reasoningContent
    : undefined;
  const theme = useTheme();
  const user = React.useContext(UserContext);
  const [previewData, setPreviewData] = React.useState(
    'previewData' in message ? message.previewData : undefined,
  );
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

  // Link preview only meaningful for legacy Text messages (image-bearing
  // user messages, multimodal). AssistantTurn rendering uses the inline
  // markdown path below.
  const linkPreviewEligible =
    !step &&
    usePreviewData &&
    !!onPreviewDataFetched &&
    visibleText.length > 0 &&
    REGEX_LINK.test(visibleText.toLowerCase());

  return (
    <>
      {linkPreviewEligible ? (
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
          text={visibleText}
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

          {/* Render images above the text — legacy Text path only. */}
          {!step && renderImages()}

          <MarkdownView
            markdownText={visibleText.trim()}
            maxMessageWidth={messageWidth}
            selectable={false}
            reasoningContent={reasoningContent}
          />
        </View>
      )}

      {/* Image preview modal — legacy Text path only. */}
      {!step && renderImagePreview()}
    </>
  );
};
