import {
  MD3DarkTheme,
  DefaultTheme as PaperLightTheme,
  configureFonts,
} from 'react-native-paper';

import {MD3BaseColors, SemanticColors, Theme} from './types';
import {withOpacity, stateLayerOpacity} from './colorUtils';

// MD3 key colors (seed colors)
const md3BaseColors: Partial<MD3BaseColors> = {
  primary: '#333333',
  secondary: '#1E4DF6',
  tertiary: '#7880FF',
  error: '#FF653F',
};

enum AppTheme {
  Light = 'light',
  Dark = 'dark',
  X1 = 'x1',
}

const createBaseColors = (appTheme: AppTheme): MD3BaseColors => {
  const baseTheme = appTheme === AppTheme.Dark ? MD3DarkTheme : PaperLightTheme;

  if (appTheme === AppTheme.Dark) {
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
      error: md3BaseColors.error!,
      onError: '#4C100D',
      errorContainer: '#661511',
      onErrorContainer: '#E6ACA9',
      background: '#000000',
      onBackground: '#ffffff',
      surface: '#0E0E0E',
      onSurface: '#E2E2E2',
      surfaceVariant: '#646466',
      onSurfaceVariant: '#e3e4e6',
      outline: '#444444',
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
      backdrop: 'rgba(38, 37, 37, 0.8)',
    };
  } else if (appTheme === AppTheme.X1) {
    return {
      primary: 'rgb(37,99,235)',
      onPrimary: 'rgb(255, 255, 255)',
      primaryContainer: 'rgb(219, 225, 255)',
      onPrimaryContainer: 'rgb(0, 23, 75)',
      secondary: 'rgb(109, 59, 215)',
      onSecondary: 'rgb(255, 255, 255)',
      secondaryContainer: 'rgb(233, 221, 255)',
      onSecondaryContainer: 'rgb(35, 0, 92)',
      tertiary: 'rgb(249,115,22)',
      onTertiary: 'rgb(255, 255, 255)',
      tertiaryContainer: 'rgb(255, 219, 202)',
      onTertiaryContainer: 'rgb(52, 17, 0)',
      error: 'rgb(186, 26, 26)',
      onError: 'rgb(255, 255, 255)',
      errorContainer: 'rgb(255, 218, 214)',
      onErrorContainer: 'rgb(65, 0, 2)',
      background: 'rgb(254, 251, 255)',
      onBackground: 'rgb(27, 27, 31)',
      surface: 'rgb(254, 251, 255)',
      onSurface: 'rgb(27, 27, 31)',
      surfaceVariant: 'rgb(226, 226, 236)',
      onSurfaceVariant: 'rgb(69, 70, 79)',
      outline: 'rgb(117, 118, 128)',
      outlineVariant: 'rgb(197, 198, 208)',
      shadow: 'rgb(0, 0, 0)',
      scrim: 'rgb(0, 0, 0)',
      inverseSurface: 'rgb(48, 48, 52)',
      inverseOnSurface: 'rgb(242, 240, 244)',
      inversePrimary: 'rgb(180, 197, 255)',
      inverseSecondary: 'rgb(208, 188, 255)',
      elevation: {
        level0: 'transparent',
        level1: 'rgb(241, 243, 253)',
        level2: 'rgb(234, 238, 252)',
        level3: 'rgb(226, 233, 251)',
        level4: 'rgb(224, 231, 251)',
        level5: 'rgb(218, 228, 250)',
      },
      surfaceDisabled: 'rgba(27, 27, 31, 0.12)',
      onSurfaceDisabled: 'rgba(27, 27, 31, 0.38)',
      backdrop: 'rgba(46, 48, 56, 0.4)',
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
    tertiaryContainer: '#F1F3FF',
    onTertiaryContainer: '#013332',
    error: md3BaseColors.error!,
    onError: '#FFFFFF',
    errorContainer: '#E6ACA9',
    onErrorContainer: '#330B09',
    background: '#ffffff',
    onBackground: '#111111',
    surface: '#F9FAFB',
    onSurface: '#333333',
    surfaceVariant: '#e4e4e6',
    onSurfaceVariant: '#646466',
    outline: withOpacity(md3BaseColors.primary!, 0.05),
    outlineVariant: '#a1a1a1',
    // Additional required MD3 colors
    surfaceDisabled: withOpacity('#fcfcfc', 0.12),
    onSurfaceDisabled: withOpacity('#333333', 0.38),
    inverseSurface: '#858585',
    inverseOnSurface: '#fcfcfc',
    inversePrimary: '#DEE0E6',
    inverseSecondary: '#95ABE6',
    shadow: '#000000',
    scrim: 'rgba(0, 0, 0, 0.25)',
    backdrop: 'rgba(51, 51, 51, 0.6)',
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
  text: baseColors.onBackground,
  textSecondary: withOpacity(baseColors.onSurface, 0.5),
  inverseText: baseColors.inverseOnSurface,
  inverseTextSecondary: withOpacity(baseColors.inverseOnSurface, 0.5),

  // Interactive states
  stateLayerOpacity: 0.12,
  hoverStateOpacity: stateLayerOpacity.hover,
  pressedStateOpacity: stateLayerOpacity.pressed,
  draggedStateOpacity: stateLayerOpacity.dragged,
  focusStateOpacity: stateLayerOpacity.focus,

  // Menu specific
  menuBackground: isDark ? '#2a2a2a' : baseColors.surface,
  menuBackgroundDimmed: withOpacity(baseColors.surface, 0.9),
  menuBackgroundActive: withOpacity(baseColors.primary, 0.08),
  menuSeparator: withOpacity(baseColors.primary, 0.5),
  menuGroupSeparator: isDark
    ? withOpacity('#FFFFFF', 0.08)
    : withOpacity('#000000', 0.08),
  menuText: baseColors.onSurface,
  menuDangerText: baseColors.error,

  // Message specific
  authorBubbleBackground: isDark ? '#212121' : '#f2f2f2',
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

  // Thinking bubble specific
  thinkingBubbleBackground: isDark ? '#142e4d' : '#f0f5fa',
  thinkingBubbleText: isDark ? '#6abaff' : '#0a5999',
  thinkingBubbleBorder: isDark
    ? 'rgba(74, 140, 199, 0.6)'
    : 'rgba(10, 89, 153, 0.4)',
  thinkingBubbleShadow: isDark ? '#4a9fff' : '#0a5999',
  thinkingBubbleChevronBackground: isDark
    ? 'rgba(74, 140, 199, 0.15)'
    : 'rgba(10, 89, 153, 0.1)',
  thinkingBubbleChevronBorder: isDark
    ? 'rgba(74, 140, 199, 0.3)'
    : 'rgba(10, 89, 153, 0.2)',

  bgStatusActive: isDark ? '#22c55e' : '#22c55e',
  bgStatusIdle: isDark ? '#4b5563' : '#d1d5db',

  btnPrimaryBg: isDark ? '#0f1629' : '#eff6ff',
  btnPrimaryBorder: isDark ? '#192645' : '#bfdbff',
  btnPrimaryText: isDark ? '#93c5fd' : '#1447e6',

  btnReadyBg: isDark ? '#052e16' : '#ecfdf5',
  btnReadyBorder: isDark ? '#166534' : '#bbf7d0',
  btnReadyText: isDark ? '#6ee7b7' : '#047857',

  btnDownloadBg: isDark ? '#0a1f17' : '#ecfdf5',
  btnDownloadBorder: isDark ? '#143d2d' : '#bbf7d0',
  btnDownloadText: isDark ? '#34d399' : '#047857',

  iconModelTypeText: isDark ? '#93c5fd' : '#3b82f6',
  iconModelTypeVision: isDark ? '#c4b5fd' : '#9810fa',
  iconModelTypeAudio: isDark ? '#fdba74' : '#f97316',
});

export const fontStyles = {
  regular: {fontFamily: 'Inter-Regular'},
  medium: {fontFamily: 'Inter-Medium'},
  bold: {fontFamily: 'Inter-Bold'},
  thin: {fontFamily: 'Inter-Thin'},
  light: {fontFamily: 'Inter-Light'},
  semibold: {fontFamily: 'Inter-SemiBold'},
  extraBold: {fontFamily: 'Inter-ExtraBold'},
};

const baseFontVariants = configureFonts({
  config: {...fontStyles.regular},
});

const customVariants = {
  // Add custom variants:
  bold: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.bold,
  },
  medium: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.medium,
  },
  thin: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.thin,
  },
  light: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.light,
  },
  semibold: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.semibold,
  },
} as const;

const configuredFonts = configureFonts({
  config: {
    ...baseFontVariants,
    ...customVariants,
    displayMedium: {
      ...baseFontVariants.displayMedium,
      ...fontStyles.bold,
    },
    titleSmall: {
      ...baseFontVariants.titleSmall,
      ...fontStyles.medium,
    },
  },
});

const createTheme = (appTheme: AppTheme): Theme => {
  const baseTheme = appTheme === AppTheme.Dark ? MD3DarkTheme : PaperLightTheme;
  const baseColors = createBaseColors(appTheme);
  const semanticColors = createSemanticColors(
    baseColors,
    appTheme === AppTheme.Dark,
  );

  return {
    ...baseTheme,
    colors: {
      ...baseColors,
      ...semanticColors,
    },
    borders: {
      inputBorderRadius: 16,
      messageBorderRadius: 15,
      default: 12,
    },
    fonts: {
      ...baseTheme.fonts,
      ...configuredFonts,
      titleMediumLight: {
        ...fontStyles.regular,
        fontSize: 16,
        lineHeight: 22,
      },
      dateDividerTextStyle: {
        ...fontStyles.extraBold,
        color: baseColors.onSurface,
        fontSize: 12,
        lineHeight: 16,
        opacity: 0.4,
      },
      emptyChatPlaceholderTextStyle: {
        color: baseColors.onSurface,
        fontSize: 16,
        lineHeight: 24,
        ...fontStyles.medium,
      },
      inputTextStyle: {
        fontSize: 16,
        lineHeight: 24,
        ...fontStyles.medium,
      },
      receivedMessageBodyTextStyle: {
        color: baseColors.onPrimary,
        fontSize: 16,
        lineHeight: 24,
        ...fontStyles.medium,
      },
      receivedMessageCaptionTextStyle: {
        color: baseColors.onSurfaceVariant,
        fontSize: 12,
        lineHeight: 16,
        ...fontStyles.medium,
      },
      receivedMessageLinkDescriptionTextStyle: {
        color: baseColors.onPrimary,
        fontSize: 14,
        lineHeight: 20,
        ...fontStyles.regular,
      },
      receivedMessageLinkTitleTextStyle: {
        color: baseColors.onPrimary,
        fontSize: 16,
        lineHeight: 22,
        ...fontStyles.extraBold,
      },
      sentMessageBodyTextStyle: {
        color: baseColors.onSurface,
        fontSize: 16,
        lineHeight: 24,
        ...fontStyles.medium,
      },
      sentMessageCaptionTextStyle: {
        color: baseColors.onSurfaceVariant,
        fontSize: 12,
        lineHeight: 16,
        ...fontStyles.medium,
      },
      sentMessageLinkDescriptionTextStyle: {
        color: baseColors.onSurface,
        fontSize: 14,
        lineHeight: 20,
        ...fontStyles.regular,
      },
      sentMessageLinkTitleTextStyle: {
        color: baseColors.onSurface,
        fontSize: 16,
        lineHeight: 22,
        ...fontStyles.extraBold,
      },
      userAvatarTextStyle: {
        color: baseColors.onSurface,
        fontSize: 12,
        lineHeight: 16,
        ...fontStyles.extraBold,
      },
      userNameTextStyle: {
        fontSize: 12,
        lineHeight: 16,
        ...fontStyles.extraBold,
      },
    },
    insets: {
      messageInsetsHorizontal: 20,
      messageInsetsVertical: 10,
    },
    spacing: {
      default: 16,
    },
    icons: {},
  };
};

export const lightTheme = createTheme(AppTheme.Light);
export const darkTheme = createTheme(AppTheme.Dark);
export const x1Theme = createTheme(AppTheme.X1);
