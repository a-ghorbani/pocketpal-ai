import React from 'react';
import {Text} from 'react-native';

const MathView = ({math, ...props}) => {
  return React.createElement(Text, props, math);
};

const mockSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

export const MathjaxFactory = () => {
  const toSVG = math => ({
    svg: mockSvg,
    size: {width: 100, height: 40},
  });
  toSVG.cache = new Map();
  return {toSVG};
};

export default MathView;
