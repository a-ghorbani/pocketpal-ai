// Mock environment variables for testing
// This mock provides all the environment variables that the app expects
// from the @env module created by react-native-dotenv

/*const mockEnv = {
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  APP_URL: 'pocketpal://app',
  ENABLE_PALSHUB_INTEGRATION: 'true',
  ENABLE_AUTHENTICATION: 'true',
  ENABLE_OFFLINE_MODE: 'true',
  GOOGLE_IOS_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
  GOOGLE_WEB_CLIENT_ID: 'test-google-web-client-id.apps.googleusercontent.com',
  FIREBASE_FUNCTIONS_URL: 'https://test-firebase-functions.com',
  APPCHECK_DEBUG_TOKEN_ANDROID: 'test-android-token',
  APPCHECK_DEBUG_TOKEN_IOS: 'test-ios-token',
  APP_RELEASE_STORE_PASSWORD: 'test-store-password',
  APP_RELEASE_KEY_PASSWORD: 'test-key-password',
};

// Export as both CommonJS and ES modules to handle different import styles
module.exports = mockEnv;
module.exports.default = mockEnv;

// Also export individual properties for named imports
Object.keys(mockEnv).forEach(key => {
  module.exports[key] = mockEnv[key];
});
*/

export const SUPABASE_URL = 'https://test-project.supabase.co';
export const SUPABASE_ANON_KEY = 'test-anon-key';
export const APP_URL = 'pocketpal://app';
export const ENABLE_PALSHUB_INTEGRATION = 'true';
export const ENABLE_AUTHENTICATION = 'true';
export const ENABLE_OFFLINE_MODE = 'true';
export const GOOGLE_IOS_CLIENT_ID =
  'test-google-client-id.apps.googleusercontent.com';
export const GOOGLE_WEB_CLIENT_ID =
  'test-google-web-client-id.apps.googleusercontent.com';
export const FIREBASE_FUNCTIONS_URL = 'https://test-firebase-functions.com';
export const APPCHECK_DEBUG_TOKEN_ANDROID = 'test-android-token';
export const APPCHECK_DEBUG_TOKEN_IOS = 'test-ios-token';
