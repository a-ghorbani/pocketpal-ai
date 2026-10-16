import type {ComponentType, ReactElement} from 'react';
import type {ViewProps} from 'react-native';
import RawMaskedView from '@react-native-masked-view/masked-view';
import RawSlider, {type SliderProps} from '@react-native-community/slider';

// Both libraries type their default export as a class over RN's legacy NativeMethods, which RN 0.87's strict types reject as a JSX element.
export const Slider = RawSlider as unknown as ComponentType<SliderProps>;

export const MaskedView = RawMaskedView as unknown as ComponentType<
  ViewProps & {
    maskElement: ReactElement;
    androidRenderingMode?: 'software' | 'hardware';
  }
>;
