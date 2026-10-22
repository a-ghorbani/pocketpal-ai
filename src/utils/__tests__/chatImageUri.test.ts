import * as RNFS from '@dr.pogodin/react-native-fs';
import {Platform} from 'react-native';

import {isAllowedChatImageUri} from '../chatImageUri';
import {withEachControl} from '../../../jest/fixtures/controlCharacters';

const mockRNFS = RNFS as any;
const savedCaches = RNFS.CachesDirectoryPath;
const savedTmp = RNFS.TemporaryDirectoryPath;
const savedOS = Platform.OS;

const ANDROID_CACHE = '/data/user/0/com.pocketpalai/cache';
const ANDROID_PICK = `file://${ANDROID_CACHE}/rn_image_picker_lib_temp_0f8a3c2e-6b1d-4f7a-9c3e-2d5b8a1e4f60.jpg`;

const IOS_CONTAINER =
  '/var/mobile/Containers/Data/Application/5D7C1A2B-3E4F-4A5B-8C9D-0E1F2A3B4C5D';
const IOS_UUID = 'A1B2C3D4-E5F6-4789-ABCD-EF0123456789';
const iosTmpRoot = (privatePrefix: boolean) =>
  `${privatePrefix ? '/private' : ''}${IOS_CONTAINER}/tmp/`;
const iosPick = (privatePrefix: boolean, name = `${IOS_UUID}.jpg`) =>
  `file://${privatePrefix ? '/private' : ''}${IOS_CONTAINER}/tmp/${name}`;

const COMMON_BAD: unknown[] = [
  '..',
  '../..',
  '/etc/hosts',
  'file:///data/local/tmp/a.jpg',
  '',
  'https://h/a.jpg',
  'data:image/png;base64,AAAA',
  'content://media/external/images/1',
];

describe('isAllowedChatImageUri', () => {
  afterEach(() => {
    Platform.OS = savedOS;
    mockRNFS.__setCachesDirectoryPath(savedCaches);
    mockRNFS.__setTemporaryDirectoryPath(savedTmp);
  });

  describe('android', () => {
    beforeEach(() => {
      Platform.OS = 'android';
      mockRNFS.__setCachesDirectoryPath(ANDROID_CACHE);
    });

    it('allows an image picker cache file', () => {
      expect(isAllowedChatImageUri(ANDROID_PICK)).toBe(true);
    });

    it('reads the cache root at call time', () => {
      mockRNFS.__setCachesDirectoryPath('/other/cache');
      expect(isAllowedChatImageUri(ANDROID_PICK)).toBe(false);
    });

    it('tolerates a trailing slash on the root', () => {
      mockRNFS.__setCachesDirectoryPath(`${ANDROID_CACHE}/`);
      expect(isAllowedChatImageUri(ANDROID_PICK)).toBe(true);
    });

    it.each([
      ...COMMON_BAD,
      `file://${ANDROID_CACHE}/..`,
      `file://${ANDROID_CACHE}/../..`,
      `file://${ANDROID_CACHE}/../files/x`,
      `file://${ANDROID_CACHE}/../files/rn_image_picker_lib_temp_x.jpg`,
      `file://${ANDROID_CACHE}/sub/rn_image_picker_lib_temp_x.jpg`,
      `file://${ANDROID_CACHE}/rn_image_picker_lib_temp_x.jpg/../../files/x`,
      `file://${ANDROID_CACHE}/other.jpg`,
      `file://${ANDROID_CACHE}/notes.json`,
      `file://${ANDROID_CACHE}/chat_my_chat_2024-01-01_12-00-00.json`,
      `file://${ANDROID_CACHE}/session-cache`,
      `file://${ANDROID_CACHE}/%2E%2E/x`,
      `file://${ANDROID_CACHE}`,
      `file://${ANDROID_CACHE}/`,
      `${ANDROID_CACHE}/rn_image_picker_lib_temp_x.jpg`,
      iosPick(false),
      7,
      null,
      undefined,
      {},
    ])('rejects %p', uri => {
      expect(isAllowedChatImageUri(uri)).toBe(false);
    });

    it.each(
      withEachControl(c => [
        `file://${ANDROID_CACHE}/rn_image_picker_lib_temp_a${c}b.jpg`,
        `file://${ANDROID_CACHE}/rn_image_picker_lib_temp_ab.jpg${c}`,
      ]),
    )('rejects %s', (_shown, uri) => {
      expect(isAllowedChatImageUri(uri)).toBe(false);
    });

    it.each(
      withEachControl(c => [
        `file://${ANDROID_CACHE}/${c}rn_image_picker_lib_temp_ab.jpg`,
        `file://${c}${ANDROID_CACHE}/rn_image_picker_lib_temp_ab.jpg`,
      ]),
    )('rejects %s, which other rules already reject', (_shown, uri) => {
      expect(isAllowedChatImageUri(uri)).toBe(false);
    });

    it('rejects everything when the cache root is unavailable', () => {
      mockRNFS.__setCachesDirectoryPath(undefined);
      expect(isAllowedChatImageUri(ANDROID_PICK)).toBe(false);
    });
  });

  describe('ios', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
      mockRNFS.__setTemporaryDirectoryPath(iosTmpRoot(true));
    });

    describe.each([true, false])('tmp root with /private: %p', rootPrivate => {
      it.each([true, false])(
        'allows a picker uri with /private: %p',
        uriPrivate => {
          mockRNFS.__setTemporaryDirectoryPath(iosTmpRoot(rootPrivate));
          expect(isAllowedChatImageUri(iosPick(uriPrivate))).toBe(true);
        },
      );

      it.each([true, false])(
        'rejects a deeper file or another name, uri /private: %p',
        uriPrivate => {
          mockRNFS.__setTemporaryDirectoryPath(iosTmpRoot(rootPrivate));
          expect(
            isAllowedChatImageUri(iosPick(uriPrivate, `sub/${IOS_UUID}.jpg`)),
          ).toBe(false);
          expect(isAllowedChatImageUri(iosPick(uriPrivate, 'notes.json'))).toBe(
            false,
          );
        },
      );
    });

    it('allows a lower-case uuid and other extensions', () => {
      expect(
        isAllowedChatImageUri(iosPick(false, `${IOS_UUID.toLowerCase()}.png`)),
      ).toBe(true);
      expect(isAllowedChatImageUri(iosPick(false, `${IOS_UUID}.HEIC`))).toBe(
        true,
      );
    });

    it('rejects everything when the tmp root is unavailable', () => {
      mockRNFS.__setTemporaryDirectoryPath(undefined);
      expect(isAllowedChatImageUri(iosPick(false))).toBe(false);
      expect(isAllowedChatImageUri(iosPick(true))).toBe(false);
    });

    it.each(
      withEachControl(c => [
        iosPick(false, `${IOS_UUID}.j${c}pg`),
        iosPick(false, `${IOS_UUID}.jpg${c}`),
        iosPick(true, `${IOS_UUID}.j${c}pg`),
      ]),
    )('rejects %s', (_shown, uri) => {
      expect(isAllowedChatImageUri(uri)).toBe(false);
    });

    it.each(
      withEachControl(c => [
        iosPick(false, `${c}${IOS_UUID}.jpg`),
        `file://${c}${IOS_CONTAINER}/tmp/${IOS_UUID}.jpg`,
      ]),
    )('rejects %s, which other rules already reject', (_shown, uri) => {
      expect(isAllowedChatImageUri(uri)).toBe(false);
    });

    it('allows a root without the trailing slash', () => {
      mockRNFS.__setTemporaryDirectoryPath(`${IOS_CONTAINER}/tmp`);
      expect(isAllowedChatImageUri(iosPick(true))).toBe(true);
    });

    it.each([
      ...COMMON_BAD,
      iosPick(false, '..'),
      iosPick(false, '../..'),
      iosPick(false, `../Documents/${IOS_UUID}.jpg`),
      iosPick(false, `${IOS_UUID}.jpg/../../Documents/x`),
      iosPick(true, `${IOS_UUID}.jpg/../../Documents/x`),
      iosPick(false, `${IOS_UUID}`),
      iosPick(false, `${IOS_UUID}.`),
      iosPick(false, `x${IOS_UUID}.jpg`),
      iosPick(false, 'A1B2C3D4-E5F6-4789-ABCD-EF012345678.jpg'),
      iosPick(false, 'pal_x_v2.0_2024-01-01_12-00-00.json'),
      iosPick(false, `%2E%2E/${IOS_UUID}.jpg`),
      iosPick(false, ''),
      `file:///private/private${IOS_CONTAINER}/tmp/${IOS_UUID}.jpg`,
      `${IOS_CONTAINER}/tmp/${IOS_UUID}.jpg`,
      `file://${IOS_CONTAINER}/Documents/${IOS_UUID}.jpg`,
      ANDROID_PICK,
      7,
      null,
      undefined,
    ])('rejects %p', uri => {
      expect(isAllowedChatImageUri(uri)).toBe(false);
    });
  });

  it('rejects on other platforms', () => {
    Platform.OS = 'web' as any;
    expect(isAllowedChatImageUri(ANDROID_PICK)).toBe(false);
    expect(isAllowedChatImageUri(iosPick(false))).toBe(false);
  });
});
