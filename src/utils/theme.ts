import {
  MD3DarkTheme,
  DefaultTheme as PaperLightTheme,
} from 'react-native-paper';

import {MD3BaseColors, SemanticColors, Theme} from './types';
import {withOpacity, stateLayerOpacity} from './colorUtils';

// MD3 key colors (seed colors)
const md3BaseColors: Partial<MD3BaseColors> = {
  primary: '#111111',
  secondary: '#3669F5',
  tertiary: '#018786',
  error: '#B3261E',
};

const createBaseColors = (isDark: boolean): MD3BaseColors => {
  const baseTheme = isDark ? MD3DarkTheme : PaperLightTheme;

  if (isDark) {
    return {
      ...baseTheme.colors,
      primary: '#DADDE6',
      onPrimary: '#44464C',
      primaryContainer: '#5B5E66',
      onPrimaryContainer: '#DEE0E6',
      secondary: '#95ABE6',
      onSecondary: '#11214C',
      secondaryContainer: '#424242',
      onSecondaryContainer: '#E0E0E0',
      tertiary: '#80E6E4',
      onTertiary: '#014C4C',
      tertiaryContainer: '#016665',
      onTertiaryContainer: '#9EE6E5',
      error: '#E69490',
      onError: '#4C100D',
      errorContainer: '#661511',
      onErrorContainer: '#E6ACA9',
      background: '#333333',
      onBackground: '#e5e5e6',
      surface: '#333333',
      onSurface: '#e5e5e6',
      surfaceVariant: '#646466',
      onSurfaceVariant: '#e3e4e6',
      outline: '#b0b1b3',
      outlineVariant: '#a1a1a1',
      // Additional required MD3 colors
      surfaceDisabled: withOpacity('#333333', 0.12),
      onSurfaceDisabled: withOpacity('#e5e5e6', 0.38),
      inverseSurface: '#e5e5e6',
      inverseOnSurface: '#333333',
      inversePrimary: '#5B5E66',
      inverseSecondary: md3BaseColors.secondary!,
      shadow: '#ffffff',
      scrim: 'rgba(0, 0, 0, 0.25)',
    };
  }

  return {
    ...baseTheme.colors,
    primary: md3BaseColors.primary!,
    onPrimary: '#FFFFFF',
    primaryContainer: '#DEE0E6',
    onPrimaryContainer: '#2D2F33',
    secondary: md3BaseColors.secondary!,
    onSecondary: '#FFFFFF',
    secondaryContainer: '#E0E0E0',
    onSecondaryContainer: '#424242',
    tertiary: md3BaseColors.tertiary!,
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#9EE6E5',
    onTertiaryContainer: '#013332',
    error: md3BaseColors.error!,
    onError: '#FFFFFF',
    errorContainer: '#E6ACA9',
    onErrorContainer: '#330B09',
    background: '#F5F5F5',
    onBackground: '#333333',
    surface: '#ffffff',
    onSurface: '#333333',
    surfaceVariant: '#e4e4e6',
    onSurfaceVariant: '#646466',
    outline: withOpacity(md3BaseColors.primary!, 0.05),
    outlineVariant: '#a1a1a1',
    // Additional required MD3 colors
    surfaceDisabled: withOpacity('#fcfcfc', 0.12),
    onSurfaceDisabled: withOpacity('#333333', 0.38),
    inverseSurface: '#333333',
    inverseOnSurface: '#fcfcfc',
    inversePrimary: '#DEE0E6',
    inverseSecondary: '#95ABE6',
    shadow: '#000000',
    scrim: 'rgba(0, 0, 0, 0.25)',
  };
};

const createSemanticColors = (
  baseColors: MD3BaseColors,
  isDark: boolean,
): SemanticColors => ({
  // Surface variants
  surfaceContainerHighest: isDark
    ? withOpacity(baseColors.surface, 0.22)
    : withOpacity(baseColors.primary, 0.05),
  surfaceContainerHigh: isDark
    ? withOpacity(baseColors.surface, 0.16)
    : withOpacity(baseColors.primary, 0.03),
  surfaceContainer: isDark
    ? withOpacity(baseColors.surface, 0.12)
    : withOpacity(baseColors.primary, 0.02),
  surfaceContainerLow: isDark
    ? withOpacity(baseColors.surface, 0.08)
    : withOpacity(baseColors.primary, 0.01),
  surfaceContainerLowest: isDark
    ? withOpacity(baseColors.surface, 0.04)
    : baseColors.surface,
  surfaceDim: isDark
    ? withOpacity(baseColors.surface, 0.06)
    : withOpacity(baseColors.primary, 0.06),
  surfaceBright: isDark
    ? withOpacity(baseColors.surface, 0.24)
    : baseColors.surface,

  border: withOpacity(baseColors.onSurface, 0.05),
  placeholder: withOpacity(baseColors.onSurface, 0.3),
  textSecondary: withOpacity(baseColors.onSurface, 0.5),

  // Interactive states
  stateLayerOpacity: 0.12,
  hoverStateOpacity: stateLayerOpacity.hover,
  pressedStateOpacity: stateLayerOpacity.pressed,
  draggedStateOpacity: stateLayerOpacity.dragged,
  focusStateOpacity: stateLayerOpacity.focus,

  // Menu specific
  menuBackground: baseColors.surface,
  menuBackgroundDimmed: withOpacity(baseColors.surface, 0.9),
  menuBackgroundActive: withOpacity(baseColors.primary, 0.08),
  menuSeparator: withOpacity(baseColors.primary, 0.5),
  menuGroupSeparator: isDark
    ? withOpacity('#FFFFFF', 0.08)
    : withOpacity('#000000', 0.08),
  menuText: baseColors.onSurface,
  menuDangerText: baseColors.error,

  // Message specific
  authorBubbleBackground: isDark
    ? 'rgba(255, 255, 255, 0.03)'
    : 'rgba(0, 0, 0, 0.04)',
  receivedMessageDocumentIcon: baseColors.primary,
  sentMessageDocumentIcon: baseColors.onSurface,
  userAvatarImageBackground: 'transparent',
  userAvatarNameColors: [
    baseColors.primary,
    baseColors.secondary,
    baseColors.tertiary,
    baseColors.error,
  ],
  searchBarBackground: isDark
    ? 'rgba(28, 28, 30, 0.92)'
    : 'rgba(118, 118, 128, 0.12)',
});

const createTheme = (isDark: boolean): Theme => {
  const baseTheme = isDark ? MD3DarkTheme : PaperLightTheme;
  const baseColors = createBaseColors(isDark);
  const semanticColors = createSemanticColors(baseColors, isDark);

  return {
    ...baseTheme,
    colors: {
      ...baseColors,
      ...semanticColors,
    },
    borders: {
      inputBorderRadius: 20,
      messageBorderRadius: 15,
    },
    fonts: {
      ...baseTheme.fonts,
      dateDividerTextStyle: {
        color: baseColors.onSurface,
        fontSize: 12,
        fontWeight: '800',
        lineHeight: 16,
        opacity: 0.4,
      },
      emptyChatPlaceholderTextStyle: {
        color: baseColors.onSurface,
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
        color: baseColors.onPrimary,
        fontSize: 16,
        fontWeight: '500',
        lineHeight: 24,
      },
      receivedMessageCaptionTextStyle: {
        color: baseColors.onSurfaceVariant,
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
      },
      receivedMessageLinkDescriptionTextStyle: {
        color: baseColors.onPrimary,
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
      },
      receivedMessageLinkTitleTextStyle: {
        color: baseColors.onPrimary,
        fontSize: 16,
        fontWeight: '800',
        lineHeight: 22,
      },
      sentMessageBodyTextStyle: {
        color: baseColors.onSurface,
        fontSize: 16,
        fontWeight: '500',
        lineHeight: 24,
      },
      sentMessageCaptionTextStyle: {
        color: baseColors.onSurfaceVariant,
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
      },
      sentMessageLinkDescriptionTextStyle: {
        color: baseColors.onSurface,
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
      },
      sentMessageLinkTitleTextStyle: {
        color: baseColors.onSurface,
        fontSize: 16,
        fontWeight: '800',
        lineHeight: 22,
      },
      userAvatarTextStyle: {
        color: baseColors.onSurface,
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
    icons: {},
  };
};

export const lightTheme = createTheme(false);
export const darkTheme = createTheme(true);
