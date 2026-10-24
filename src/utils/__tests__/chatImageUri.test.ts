import * as RNFS from '@dr.pogodin/react-native-fs';
import {Platform} from 'react-native';

import {isAllowedChatImageUri} from '../chatImageUri';

const savedOS = Platform.OS;
const CACHE = RNFS.CachesDirectoryPath;
const TMP = RNFS.TemporaryDirectoryPath;
const ANDROID_PICK = `file://${CACHE}/rn_image_picker_lib_temp_0f8a.jpg`;
const IOS_NAME = 'A1B2C3D4-E5F6-4789-ABCD-EF0123456789.jpg';
const IOS_PICK = `file://${TMP}${IOS_NAME}`;

describe('isAllowedChatImageUri', () => {
  afterEach(() => {
    Platform.OS = savedOS;
  });

  describe('android', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('allows an image picker cache file', () => {
      expect(isAllowedChatImageUri(ANDROID_PICK)).toBe(true);
    });

    it.each([
      `file://${CACHE}/..`,
      `file://${CACHE}/../..`,
      `file://${CACHE}/../files/rn_image_picker_lib_temp_x.jpg`,
      '/etc/hosts',
      'file:///data/local/tmp/rn_image_picker_lib_temp_x.jpg',
      '',
      `file://${CACHE}/rn_image_picker_lib_temp_a\u0000b.jpg`,
      `file://${CACHE}/other.jpg`,
    ])('rejects %j', uri => {
      expect(isAllowedChatImageUri(uri)).toBe(false);
    });
  });

  describe('ios', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
    });

    it.each([IOS_PICK, `file:///private${TMP}${IOS_NAME}`])(
      'allows the picker file %j',
      uri => {
        expect(isAllowedChatImageUri(uri)).toBe(true);
      },
    );

    it.each([
      `file://${TMP}..`,
      `file://${TMP}../..`,
      `file://${TMP}${IOS_NAME}/../../Documents/x`,
      '/etc/hosts',
      `file:///data/local/tmp/${IOS_NAME}`,
      '',
      `file://${TMP}A1B2C3D4-E5F6-4789-ABCD-EF0123456789.j\u0000pg`,
      `file://${TMP}notes.json`,
    ])('rejects %j', uri => {
      expect(isAllowedChatImageUri(uri)).toBe(false);
    });
  });
});
