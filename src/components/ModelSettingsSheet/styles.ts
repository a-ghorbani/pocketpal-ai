import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  sheetScrollViewContainer: {
    padding: 16,
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  multimodalDivider: {
    marginVertical: 16,
  },
  multimodalSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  reasoningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reasoningHelp: {
    marginBottom: 12,
    opacity: 0.7,
  },
  effortChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statusText: {
    marginBottom: 8,
    opacity: 0.75,
  },
  warningText: {
    marginBottom: 12,
    color: '#b3261e',
  },
});
