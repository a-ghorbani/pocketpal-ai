import {APPCHECK_DEBUG_TOKEN_ANDROID, APPCHECK_DEBUG_TOKEN_IOS} from '@env';

// Track initialization status
let isAppCheckInitialized = false;
let appCheckInstance: any;

export const initializeAppCheck = async () => {
  if (!__ENABLE_PALSHUB__) {
    throw new Error('Firebase App Check is disabled in this build.');
  }
  if (isAppCheckInitialized) {
    return;
  }

  try {
    const {getApp} =
      require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
    const {
      ReactNativeFirebaseAppCheckProvider,
      initializeAppCheck: fbInitializeAppCheck,
    } =
      require('@react-native-firebase/app-check') as typeof import('@react-native-firebase/app-check');

    // Ensure Firebase app is initialized first
    const app = getApp();
    if (!app) {
      throw new Error('Firebase app is not initialized');
    }

    // Skip App Check initialization if debug tokens are not configured in dev mode
    if (
      __DEV__ &&
      (!APPCHECK_DEBUG_TOKEN_ANDROID || !APPCHECK_DEBUG_TOKEN_IOS)
    ) {
      console.warn(
        'Firebase App Check debug tokens not configured - skipping initialization in dev mode',
      );
      return;
    }

    // const rnfbProvider = appCheck().newReactNativeFirebaseAppCheckProvider();
    const rnfbProvider = new ReactNativeFirebaseAppCheckProvider();

    rnfbProvider.configure({
      android: {
        provider: __DEV__ ? 'debug' : 'playIntegrity',
        debugToken: APPCHECK_DEBUG_TOKEN_ANDROID,
      },
      apple: {
        provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
        debugToken: APPCHECK_DEBUG_TOKEN_IOS,
      },
    });
    appCheckInstance = await fbInitializeAppCheck(getApp(), {
      provider: rnfbProvider,
      isTokenAutoRefreshEnabled: true,
    });

    isAppCheckInitialized = true;
  } catch (error) {
    console.error('Failed to initialize Firebase App Check:', error);
    throw error;
  }
};

// Get a fresh App Check token
export const getAppCheckToken = async () => {
  if (!__ENABLE_PALSHUB__) {
    throw new Error('Firebase App Check is disabled in this build.');
  }
  try {
    const {token} = await appCheckInstance.getToken();
    return token;
  } catch (error) {
    console.error('Failed to get App Check token:', error);
    throw error;
  }
};
