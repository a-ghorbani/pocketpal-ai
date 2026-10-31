import React from 'react';
import {Linking} from 'react-native';
import type {StyleProp, TextProps, TextStyle} from 'react-native';

import {APPLE_MEDIA_TERMS_URL} from '../../config/urls';

interface NoticeLink {
  label: string;
  url: string;
  testID?: string;
}

interface LicenseNoticeProps {
  TextComponent:
    | React.ComponentType<TextProps>
    | React.FC<TextProps & {children: React.ReactNode}>;
  style: StyleProp<TextStyle>;
  linkStyle: StyleProp<TextStyle>;
  testID?: string;
  notice: string;
  firstLink: NoticeLink;
  appleTermsLabel: string;
  appleTermsTestID?: string;
}

export const LicenseNotice: React.FC<LicenseNoticeProps> = ({
  TextComponent,
  style,
  linkStyle,
  testID,
  notice,
  firstLink,
  appleTermsLabel,
  appleTermsTestID,
}) => (
  <TextComponent testID={testID} style={style}>
    {notice}{' '}
    <TextComponent
      testID={firstLink.testID}
      accessibilityRole="link"
      style={linkStyle}
      onPress={() => Linking.openURL(firstLink.url)}>
      {firstLink.label}
    </TextComponent>
    {' · '}
    <TextComponent
      testID={appleTermsTestID}
      accessibilityRole="link"
      style={linkStyle}
      onPress={() => Linking.openURL(APPLE_MEDIA_TERMS_URL)}>
      {appleTermsLabel}
    </TextComponent>
  </TextComponent>
);
