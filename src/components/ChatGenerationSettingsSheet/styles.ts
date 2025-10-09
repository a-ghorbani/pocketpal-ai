import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  scrollviewContainer: {
    padding: 16,
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  resetWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resetButton: {
    marginRight: 0,
  },
  resetButtonContent: {
    flexDirection: 'row-reverse',
  },
  rightButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    maxWidth: '70%',
  },
  button: {
    flex: 1,
  },
  settingsSourceContainer: {
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  settingsSourceTitle: {
    marginBottom: 8,
    fontWeight: '500',
  },
});
