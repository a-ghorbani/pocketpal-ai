import DeviceInfo from 'react-native-device-info';

/**
 * User-Agent for outbound Hugging Face requests (API + model downloads).
 * The `(ai.pocketpal)` token is a fixed attribution key on both platforms.
 */
export const hfUserAgent = (): string =>
  `PocketPal/${DeviceInfo.getVersion()} (ai.pocketpal)`;
