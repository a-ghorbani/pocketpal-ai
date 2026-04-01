import {
  MD3DarkTheme,
  DefaultTheme as PaperLightTheme,
  configureFonts,
} from 'react-native-paper';

import {MD3BaseColors, SemanticColors, Theme} from './types';
import {withOpacity, stateLayerOpacity} from './colorUtils';

// MD3 key colors (seed colors)
const md3BaseColors: Partial<MD3BaseColors> = {
  primary: '#2563EB',
  secondary: '#0EA5E9',
  tertiary: '#6366F1',
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
      primary: '#FFFFFF',
      onPrimary: '#0A0A0A',
      primaryContainer: '#1F1F1F',
      onPrimaryContainer: '#F0F0F0',
      secondary: '#A0A0A0',
      onSecondary: '#0A0A0A',
      secondaryContainer: '#1A1A1A',
      onSecondaryContainer: '#D0D0D0',
      tertiary: '#707070',
      onTertiary: '#0A0A0A',
      tertiaryContainer: '#1A1A1A',
      onTertiaryContainer: '#C0C0C0',
      error: md3BaseColors.error!,
      onError: '#0A0A0A',
      errorContainer: '#3D0000',
      onErrorContainer: '#FF9999',
      background: '#0A0A0A',
      onBackground: '#FFFFFF',
      surface: '#141414',
      onSurface: '#E8E8E8',
      surfaceVariant: '#2A2A2A',
      onSurfaceVariant: '#B0B0B0',
      outline: '#3A3A3A',
      outlineVariant: '#505050',
      surfaceDisabled: withOpacity('#1A1A1A', 0.12),
      onSurfaceDisabled: withOpacity('#E8E8E8', 0.38),
      inverseSurface: '#E8E8E8',
      inverseOnSurface: '#141414',
      inversePrimary: '#1A1A1A',
      inverseSecondary: '#505050',
      shadow: '#000000',
      scrim: 'rgba(0, 0, 0, 0.5)',
      backdrop: 'rgba(0, 0, 0, 0.7)',
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
    primary: '#000000',
    onPrimary: '#FFFFFF',
    primaryContainer: '#F0F0F0',
    onPrimaryContainer: '#111111',
    secondary: '#444444',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#EBEBEB',
    onSecondaryContainer: '#222222',
    tertiary: '#666666',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#F5F5F5',
    onTertiaryContainer: '#333333',
    error: md3BaseColors.error!,
    onError: '#FFFFFF',
    errorContainer: '#FFE5E5',
    onErrorContainer: '#7F0000',
    background: '#FFFFFF',
    onBackground: '#111111',
    surface: '#F5F5F5',
    onSurface: '#111111',
    surfaceVariant: '#E8E8E8',
    onSurfaceVariant: '#555555',
    outline: '#DDDDDD',
    outlineVariant: '#BBBBBB',
    surfaceDisabled: withOpacity('#EEEEEE', 0.12),
    onSurfaceDisabled: withOpacity('#111111', 0.38),
    inverseSurface: '#222222',
    inverseOnSurface: '#F5F5F5',
    inversePrimary: '#E0E0E0',
    inverseSecondary: '#888888',
    shadow: '#000000',
    scrim: 'rgba(0, 0, 0, 0.25)',
    backdrop: 'rgba(0, 0, 0, 0.5)',
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
