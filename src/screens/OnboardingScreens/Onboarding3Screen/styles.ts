import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  // Figma `885:29436` Cads frame — 369×217 layout slot. Use explicit
  // height instead of aspectRatio: RN's flex layout was expanding the
  // Image to its intrinsic 1572×925 inside the centered scaffold body.
  cards: {
    width: 369,
    height: 217,
  },
});
