import * as React from 'react';
import {TextInputProps, View} from 'react-native';
import {observer} from 'mobx-react';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {CircularActivityIndicatorProps, ChatInput} from '..';
import {PalType} from '../PalsSheets/types';

export interface CameraChatInputTopLevelProps {
  /** Whether the AI is currently streaming tokens */
  isStreaming?: boolean;
  /** Whether the camera is active */
  isCameraActive?: boolean;
  /** Will be called when the start button is pressed */
  onStartPress: () => void;
  /** Will be called when the stop button is pressed */
  onStopPress?: () => void;
  /** Called when the Pal button is pressed */
  onPalBtnPress?: () => void;
  /** Whether the picker is visible */
  isPickerVisible?: boolean;
  /** Background color for the input */
  inputBackgroundColor?: string;
}

export interface CameraChatInputAdditionalProps {
  /** Props for the circular activity indicator shown when attachment is uploading */
  attachmentCircularActivityIndicatorProps?: CircularActivityIndicatorProps;
  /** Height of the chat input */
  chatInputHeight?: {height: number};
  /** Text input props */
  textInputProps?: TextInputProps;
}

export type CameraChatInputProps = CameraChatInputTopLevelProps &
  CameraChatInputAdditionalProps;

/** Modified chat input component for CameraPal that shows start/stop buttons instead of send */
export const CameraChatInput = observer(
  ({
    isStreaming = false,
    isCameraActive = false,
    onStartPress,
    onStopPress,
    onPalBtnPress,
    isPickerVisible,
    textInputProps,
    inputBackgroundColor,
  }: CameraChatInputProps) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles();

    return (
      <View style={styles.container}>
        <ChatInput
          isStreaming={isStreaming}
          isCameraActive={isCameraActive}
          onStartCamera={onStartPress}
          onStopPress={onStopPress}
          onPalBtnPress={onPalBtnPress}
          isPickerVisible={isPickerVisible}
          textInputProps={{
            ...textInputProps,
            editable: false,
            placeholder: l10n.camera.analyzing,
          }}
          inputBackgroundColor={inputBackgroundColor}
          palType={PalType.CAMERA}
          onSendPress={() => {}} // Required prop but not used for camera
        />
      </View>
    );
  },
);
