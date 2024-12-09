import {Dimensions, StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

const screenHeight = Dimensions.get('window').height;

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 4,
    },
    chatTemplateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 2,
    },
    chatTemplateLabel: {
      flex: 1,
    },
    chatTemplateContainer: {
      flex: 2,
      height: 20,
      overflow: 'hidden',
    },
    chatTemplateMaskContainer: {
      flex: 1,
      flexDirection: 'row',
    },
    chatTemplatePreviewGradient: {
      flex: 1,
    },
    textArea: {
      fontSize: 12,
      lineHeight: 16,
      borderRadius: 8,
    },
    scrollView: {
      maxHeight: screenHeight * 0.4,
    },
    completionSettingsContainer: {
      marginTop: 12,
      paddingHorizontal: 2,
    },
    switchContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 4,
    },
    settingsSection: {
      paddingVertical: 8,
    },
    divider: {
      marginVertical: 4,
    },
    templateNote: {
      color: theme.colors.textSecondary,
      marginVertical: 8,
    },
  });
