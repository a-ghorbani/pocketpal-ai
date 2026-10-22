import * as RNFS from '@dr.pogodin/react-native-fs';
import {Platform} from 'react-native';

import {isSafePathSegment} from './pathGuard';

const FILE_SCHEME = 'file://';
const ANDROID_PICKER_NAME_PREFIX = 'rn_image_picker_lib_temp_';
const IOS_PICKER_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\..+$/i;
const IOS_PRIVATE_PREFIX = '/private';

const withoutTrailingSlashes = (path: string): string =>
  path.replace(/\/+$/, '');

const withoutPrivatePrefix = (path: string): string =>
  path.startsWith(`${IOS_PRIVATE_PREFIX}/`)
    ? path.slice(IOS_PRIVATE_PREFIX.length)
    : path;

const directChildName = (root: unknown, path: string): string | null => {
  if (typeof root !== 'string') {
    return null;
  }
  const base = withoutTrailingSlashes(root);
  if (!base.startsWith('/') || !path.startsWith(`${base}/`)) {
    return null;
  }
  const name = path.slice(base.length + 1);
  return isSafePathSegment(name) ? name : null;
};

const isAndroidPickerImage = (path: string): boolean => {
  const name = directChildName(RNFS.CachesDirectoryPath, path);
  return !!name && name.startsWith(ANDROID_PICKER_NAME_PREFIX);
};

const isIosPickerImage = (path: string): boolean => {
  const root = RNFS.TemporaryDirectoryPath;
  if (typeof root !== 'string') {
    return false;
  }
  const name = directChildName(
    withoutPrivatePrefix(withoutTrailingSlashes(root)),
    withoutPrivatePrefix(path),
  );
  return !!name && IOS_PICKER_NAME.test(name);
};

export const isAllowedChatImageUri = (uri: unknown): boolean => {
  if (typeof uri !== 'string' || !uri.startsWith(FILE_SCHEME)) {
    return false;
  }
  const path = uri.slice(FILE_SCHEME.length);
  if (Platform.OS === 'android') {
    return isAndroidPickerImage(path);
  }
  if (Platform.OS === 'ios') {
    return isIosPickerImage(path);
  }
  return false;
};
