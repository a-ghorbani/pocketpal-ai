import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    flatList: {
      height: '100%',
      // flex: 1,
    },
    flatListContentContainer: {
      flexGrow: 1,
    },
    footer: {
      height: 16,
    },
    footerLoadingPage: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      height: 32,
    },
    header: {
      height: 4,
    },
    menu: {
      width: 170,
    },
    scrollToBottomButton: {
      position: 'absolute',
      right: 16,
      backgroundColor: theme.colors.primary,
      width: 35,
      height: 35,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    suggestedPromptsOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 9,
      backgroundColor: 'transparent',
    },
    inputContainer: {
      borderTopLeftRadius: theme.borders.inputBorderRadius,
      borderTopRightRadius: theme.borders.inputBorderRadius,
      position: 'absolute',
      zIndex: 10,
      left: 0,
      right: 0,
      bottom: 0,
      ...(!theme.dark
        ? {
            boxShadow: `0px -2px 8px ${theme.colors.shadow}1A`,
          }
        : {}),
    },
    chatContainer: {
      flex: 1,
      position: 'relative',
      backgroundColor: theme.colors.background,
      zIndex: 0,
    },
    headerWrapper: {
      zIndex: 100,
    },
    customBottomComponent: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
    softCapBanner: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.colors.surfaceVariant,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.outline,
    },
    softCapBannerText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center' as const,
    },
    contextBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.colors.surfaceVariant,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.outline,
    },
    contextWarningBanner: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.colors.surfaceVariant,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.outline,
    },
    contextBannerText: {
      flex: 1,
      flexShrink: 1,
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    contextFullBanner: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.colors.errorContainer,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.error,
    },
    contextFullBannerText: {
      fontSize: 12,
      color: theme.colors.onErrorContainer,
    },
    contextBannerActions: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginTop: 6,
    },
    bannerHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    bannerHeaderText: {
      flex: 1,
      flexShrink: 1,
    },
    bannerPercent: {
      fontSize: 12,
      fontWeight: '600' as const,
      fontVariant: ['tabular-nums'],
    },
    bannerMeter: {
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.surfaceDisabled,
      overflow: 'hidden' as const,
      marginTop: 6,
      alignSelf: 'stretch' as const,
      width: '100%' as const,
    },
    bannerMeterFill: {
      height: 4,
      borderRadius: 2,
    },
    bannerOr: {
      fontSize: 11.5,
      color: theme.colors.onErrorContainer,
    },
    contextFullSecondaryButton: {
      borderColor: theme.colors.onErrorContainer,
    },
  });
