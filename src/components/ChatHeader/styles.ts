import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';
import {EdgeInsets} from 'react-native-safe-area-context';

export const createStyles = ({
  theme,
  insets,
  headerHeight,
}: {
  theme: Theme;
  insets: EdgeInsets;
  headerHeight: number;
}) =>
  StyleSheet.create({
    container: {
      height: headerHeight,
      paddingTop: insets.top,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      backgroundColor: theme.colors.background,
    },
    title: {
      ...theme.fonts.titleMedium,
      color: theme.colors.onBackground,
    },
  });
