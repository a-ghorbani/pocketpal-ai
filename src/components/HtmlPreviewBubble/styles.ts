import {StyleSheet} from 'react-native';

export const createStyles = (colors: {
  background: string;
  border: string;
  text: string;
  headerBg: string;
  modalOverlay: string;
}) =>
  StyleSheet.create({
    container: {
      marginVertical: 8,
      marginHorizontal: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.headerBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    headerButton: {
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    collapsedWebView: {
      height: 250,
      width: '100%',
      backgroundColor: colors.background,
    },
    codeSurface: {
      backgroundColor: '#282c34',
    },
    codeInnerScroll: {
      backgroundColor: '#282c34',
    },
    codeContent: {
      padding: 12,
      minWidth: '100%',
      flexGrow: 1,
    },
    codeText: {
      fontFamily: 'Menlo',
      fontSize: 11,
      lineHeight: 16,
      // Default color for any token the highlighter doesn't colorize;
      // atomOneDark lays its own per-token colors on top.
      color: '#abb2bf',
    },
    modalRoot: {
      flex: 1,
      backgroundColor: colors.modalOverlay,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.headerBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
    },
    closeButton: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    modalHeaderButton: {
      marginRight: 8,
    },
    modalWebView: {
      flex: 1,
      backgroundColor: colors.background,
    },
  });
