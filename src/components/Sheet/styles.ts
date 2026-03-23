import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  closeBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    minWidth: 44,
    minHeight: 44,
    padding: 8,
    elevation: 8,
  },
  header: {
    marginHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
});
