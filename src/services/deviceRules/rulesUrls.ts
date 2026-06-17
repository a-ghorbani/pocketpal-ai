import {Platform} from 'react-native';

const JSDELIVR_BASE =
  'https://cdn.jsdelivr.net/gh/a-ghorbani/pocketpal-device-rules@main';

// The advisory rules repo serves one file per platform. iPadOS reports as
// 'ios', so the iOS rules file covers iPad too.
export const getRulesUrl = (
  platform: 'ios' | 'android' = Platform.OS as 'ios' | 'android',
): string => `${JSDELIVR_BASE}/rules.${platform}.json`;
