import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // SendButton keeps a 16 px left margin for its other neighbours; sit
    // closer to it so mic and send read as one group.
    marginRight: -12,
  },
});
