declare module 'react-native/Libraries/Blob/Blob' {
  class Blob {
    constructor(parts: Array<Blob | string>);

    get size(): number;
  }

  export default Blob;
}

declare module '*.png' {
  const value: any;
  export default value;
}

declare module 'react-native-math-view' {
  import React from 'react';
  import {StyleProp, ViewStyle} from 'react-native';

  interface MathViewProps {
    math: string;
    style?: StyleProp<ViewStyle>;
    resizeMode?: 'contain' | 'cover' | 'stretch';
    onError?: (error: Error) => void;
  }

  const MathView: React.FC<MathViewProps>;
  export default MathView;
}

declare module '*.svg' {
  import React from 'react';
  import {SvgProps} from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}
