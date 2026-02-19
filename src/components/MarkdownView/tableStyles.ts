import {ViewStyle} from 'react-native';

import {Theme} from '../../utils/types';

export const createTableStyles = (theme: Theme) => ({
  tableOuter: {
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 4,
    marginVertical: 8,
    overflow: 'hidden' as const,
  } as ViewStyle,
  tableInner: {
    minWidth: '100%' as const,
  } as ViewStyle,
  row: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  } as ViewStyle,
  lastRow: {
    borderBottomWidth: 0,
  } as ViewStyle,
  headerRow: {
    backgroundColor: theme.colors.surfaceContainerHigh,
  } as ViewStyle,
  cell: {
    flex: 1,
    minWidth: 80,
    padding: 8,
  } as ViewStyle,
  headerCell: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    fontWeight: 'bold' as const,
  } as ViewStyle,
  cellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.outline,
  } as ViewStyle,
});
