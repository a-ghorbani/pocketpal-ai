import {StyleSheet} from 'react-native';

export const createStyles = (colors: {
  background: string;
  border: string;
  text: string;
  accent: string;
}) =>
  StyleSheet.create({
    container: {
      marginVertical: 8,
      marginHorizontal: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      backgroundColor: colors.background,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    icon: {
      fontSize: 16,
      marginTop: 1,
    },
    text: {
      flex: 1,
      fontStyle: 'italic',
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
  });
