import {Theme} from '../../utils/types';

export const createTableStyles = (theme: Theme) => ({
  tableOuter: {
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 4,
    marginVertical: 8,
    overflow: 'hidden' as const,
  },
  tableInner: {
    minWidth: '100%' as const,
  },
  row: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  headerRow: {
    backgroundColor: theme.colors.surfaceContainerHigh,
  },
  cell: {
    flex: 1,
    width: 0,
    minWidth: 80,
    padding: 8,
  },
  headerCell: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    fontWeight: 'bold' as const,
  },
  cellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.outline,
  },
  alignLeft: {
    alignItems: 'flex-start' as const,
  },
  alignCenter: {
    alignItems: 'center' as const,
  },
  alignRight: {
    alignItems: 'flex-end' as const,
  },
});
