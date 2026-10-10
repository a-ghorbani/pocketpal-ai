import React from 'react';
import {TouchableOpacity} from 'react-native';

export const appleAuth = {
  isSupported: true,
  isSignUpButtonSupported: true,
  performRequest: jest.fn(),
  getCredentialStateForUser: jest.fn(),
  onCredentialRevoked: jest.fn(() => jest.fn()),
  Error: {
    UNKNOWN: '1000',
    CANCELED: '1001',
    INVALID_RESPONSE: '1002',
    NOT_HANDLED: '1003',
    FAILED: '1004',
  },
  Operation: {IMPLICIT: 0, LOGIN: 1, REFRESH: 2, LOGOUT: 3},
  Scope: {EMAIL: 0, FULL_NAME: 1},
};

const AppleButtonMock = ({testID, onPress, style}: any) =>
  React.createElement(TouchableOpacity, {testID, onPress, style});

AppleButtonMock.Type = {
  DEFAULT: 'SignIn',
  SIGN_IN: 'SignIn',
  CONTINUE: 'Continue',
  SIGN_UP: 'SignUp',
};
AppleButtonMock.Style = {
  DEFAULT: 'White',
  WHITE: 'White',
  WHITE_OUTLINE: 'WhiteOutline',
  BLACK: 'Black',
};

export const AppleButton = AppleButtonMock;

export default appleAuth;
