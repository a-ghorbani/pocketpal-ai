import {Platform, StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 80,
  },
  imageContainer: {
    position: 'absolute',
    transform:
      Platform.OS === 'android' ? [{rotate: '180deg'}] : [{rotateX: '180deg'}],
  },
  logo: {
    width: 45,
    height: 45,
    borderRadius: 10,
  },
});
