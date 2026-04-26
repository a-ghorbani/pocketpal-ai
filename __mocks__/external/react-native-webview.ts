import * as React from 'react';
import {View} from 'react-native';

export const WebView = (props: any) =>
  React.createElement(View, {testID: 'mock-webview', ...props});

export default WebView;
