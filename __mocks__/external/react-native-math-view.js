import React from 'react';
import {Text} from 'react-native';

const MathView = ({math, ...props}) => {
  return React.createElement(Text, props, math);
};

export default MathView;
