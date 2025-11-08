import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';
import {fontStyles} from '../../utils/theme';

export const createStyles = ({
  theme,
  isEditMode,
}: {
  theme: Theme;
  isEditMode: boolean;
}) =>
  StyleSheet.create({
    container: {
      flexDirection: 'column',
    },
    palBtn: {
      height: 28,
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 100,
    },
    plusButton: {
      height: 28,
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 100,
      opacity: 0.9,
    },
    thinkingToggle: {
      height: 28,
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 100,
      borderWidth: 1,
      marginRight: 8,
    },
    thinkingToggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginLeft: 8,
    },
    thinkingToggleLeftDisabled: {
      backgroundColor: 'transparent',
    },
    thinkingToggleText: {
      fontSize: 12,
      fontWeight: '500',
      marginLeft: 4,
    },
    thinkingToggleTextDisabled: {
      // Dynamic color will be applied via theme
    },
    palSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 13,
      flexShrink: 1,
    },
    input: {
      ...theme.fonts.inputTextStyle,
      color: theme.colors.inverseOnSurface,
      flex: 1,
      maxHeight: 150,
      paddingVertical: 0,
    },
    marginRight: {
      marginRight: 16,
    },
    inputContainer: {
      flex: 1,
      flexDirection: 'column',
      borderRadius: 12,
      overflow: 'hidden',
    },
    textInputArea: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 8,
    },
    controlBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 10,
      minHeight: 36,
    },
    leftControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    rightControls: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
    },
    editBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.surfaceVariant,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
      zIndex: 10, // Ensure edit bar stays above other elements
    },
    editBarText: {
      color: theme.colors.onSurfaceVariant,
    },
    editBarButton: {
      margin: 0,
    },
    inputRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 24,
      paddingVertical: 20,
      marginTop: isEditMode ? 28 : 0,
    },
    palNameWrapper: {
      ...fontStyles.regular,
      color: theme.colors.inverseOnSurface,
      fontSize: 12,
    },
    palName: {
      fontSize: 12,
      color: theme.colors.inverseOnSurface,
      ...fontStyles.semibold,
    },
    // New compact pal name styles for control bar
    palNameCompact: {
      fontSize: 10,
      ...fontStyles.regular,
      color: theme.colors.inverseOnSurface,
    },
    palNameValueCompact: {
      fontSize: 10,
      ...fontStyles.semibold,
      color: theme.colors.inverseOnSurface,
    },
    // Image preview styles
    imagePreviewContainer: {
      marginVertical: 8,
      paddingHorizontal: 16,
    },
    imagePreviewContainerEditMode: {
      marginTop: 36, // Account for edit bar height (28px) + extra spacing (8px)
    },
    imageScrollContent: {
      paddingHorizontal: 4,
    },
    imageContainer: {
      marginHorizontal: 4,
      position: 'relative',
    },
    previewImage: {
      width: 80,
      height: 80,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
    },
    removeImageButton: {
      position: 'absolute',
      top: 0,
      right: 0,
      margin: 0,
      padding: 0,
      backgroundColor: theme.colors.surface,
      borderRadius: 8,
      width: 25,
      height: 25,
    },
    inputInnerContainer: {
      flexShrink: 1,
      flexGrow: 1,
    },
    // Camera-specific styles
    cameraButton: {
      width: 40,
      height: 40,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },

    stopButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },

    // Compact Video Button (for right side)
    compactVideoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      gap: 6,
      minWidth: 85,
    },
    compactButtonText: {
      color: 'white',
      fontSize: 12,
      fontWeight: '600',
    },
    // Prompt Label for Video Pals
    promptLabel: {
      marginBottom: 4,
    },
    inputWithLabel: {
      marginTop: 0,
    },
    // Helper text for model not loaded warning
    helperTextContainer: {
      position: 'absolute',
      bottom: '100%',
      right: 0,
      marginBottom: 4,
      backgroundColor: theme.colors.errorContainer,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      maxWidth: 250,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 3,
    },
    helperText: {
      color: theme.colors.onErrorContainer,
      fontSize: 11,
      lineHeight: 14,
    },
  });
