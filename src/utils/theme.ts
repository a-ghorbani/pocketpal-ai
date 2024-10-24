import {
  MD3DarkTheme,
  DefaultTheme as PaperLightTheme,
} from 'react-native-paper';

import {Colors, Theme} from './types';

import {getThemeColorsAsArray} from '.';

const lightColors: Colors = {
  ...PaperLightTheme.colors,
  primary: '#2881ff', //PaperLightTheme.colors.primary,
  accent: '#03dac4',
  outlineVariant: '#a1a1a1',
  receivedMessageDocumentIcon: PaperLightTheme.colors.primary,
  sentMessageDocumentIcon: PaperLightTheme.colors.onSurface,
  userAvatarImageBackground: 'transparent',
  userAvatarNameColors: getThemeColorsAsArray(PaperLightTheme),
};

export const lightTheme: Theme = {
  ...PaperLightTheme,
  borders: {
    inputBorderRadius: 20,
    messageBorderRadius: 20,
  },
  colors: lightColors,
  fonts: {
    ...PaperLightTheme.fonts,
    dateDividerTextStyle: {
      color: lightColors.onSurface,
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 16,
      opacity: 0.4,
    },
    emptyChatPlaceholderTextStyle: {
      color: lightColors.onSurface,
      fontSize: 16,
      fontWeight: '500',
      lineHeight: 24,
    },
    inputTextStyle: {
      fontSize: 16,
      fontWeight: '500',
      lineHeight: 24,
    },
    receivedMessageBodyTextStyle: {
      color: lightColors.onPrimary,
      fontSize: 16,
      fontWeight: '500',
      lineHeight: 24,
    },
    receivedMessageCaptionTextStyle: {
      color: lightColors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    receivedMessageLinkDescriptionTextStyle: {
      color: lightColors.onPrimary,
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 20,
    },
    receivedMessageLinkTitleTextStyle: {
      color: lightColors.onPrimary,
      fontSize: 16,
      fontWeight: '800',
      lineHeight: 22,
    },
    sentMessageBodyTextStyle: {
      color: lightColors.onSurface,
      fontSize: 16,
      fontWeight: '500',
      lineHeight: 24,
    },
    sentMessageCaptionTextStyle: {
      color: lightColors.onSurfaceVariant,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    sentMessageLinkDescriptionTextStyle: {
      color: lightColors.onSurface,
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 20,
    },
    sentMessageLinkTitleTextStyle: {
      color: lightColors.onSurface,
      fontSize: 16,
      fontWeight: '800',
      lineHeight: 22,
    },
    userAvatarTextStyle: {
      color: lightColors.onSurface,
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 16,
    },
    userNameTextStyle: {
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 16,
    },
  },
  insets: {
    messageInsetsHorizontal: 20,
    messageInsetsVertical: 10,
  },
};

const darkColors: Colors = {
  ...MD3DarkTheme.colors,
  primary: '#64a4ff',
  accent: '#03dac6',
  outlineVariant: '#a1a1a1',
  receivedMessageDocumentIcon: MD3DarkTheme.colors.primary,
  sentMessageDocumentIcon: MD3DarkTheme.colors.onSurface,
  userAvatarImageBackground: 'transparent',
  userAvatarNameColors: getThemeColorsAsArray(MD3DarkTheme),
};

export const darkTheme: Theme = {
  ...MD3DarkTheme,
  borders: lightTheme.borders,
  colors: darkColors,
  fonts: {
    ...lightTheme.fonts,
    dateDividerTextStyle: {
      ...lightTheme.fonts.dateDividerTextStyle,
      color: MD3DarkTheme.colors.onSurface,
    },
    receivedMessageBodyTextStyle: {
      ...lightTheme.fonts.receivedMessageBodyTextStyle,
      color: MD3DarkTheme.colors.onPrimary,
    },
    receivedMessageCaptionTextStyle: {
      ...lightTheme.fonts.receivedMessageCaptionTextStyle,
      color: MD3DarkTheme.colors.onSurfaceVariant,
    },
    receivedMessageLinkDescriptionTextStyle: {
      ...lightTheme.fonts.receivedMessageLinkDescriptionTextStyle,
      color: MD3DarkTheme.colors.onPrimary,
    },
    receivedMessageLinkTitleTextStyle: {
      ...lightTheme.fonts.receivedMessageLinkTitleTextStyle,
      color: MD3DarkTheme.colors.onPrimary,
    },
  },
  insets: lightTheme.insets,
};
