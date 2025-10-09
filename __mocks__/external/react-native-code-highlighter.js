import React from 'react';
import {Text} from 'react-native';

// Mock implementation of react-native-code-highlighter for testing
const CodeHighlighter = ({children, ...props}) => {
  return React.createElement(Text, props, children);
};

export default CodeHighlighter;
