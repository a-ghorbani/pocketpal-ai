declare module '@env' {
  export const FIREBASE_FUNCTIONS_URL: string;
  export const APPCHECK_DEBUG_TOKEN_ANDROID: string;
  export const APPCHECK_DEBUG_TOKEN_IOS: string;

  // PalsHub/Supabase Configuration
  export const SUPABASE_URL: string;
  export const SUPABASE_ANON_KEY: string;

  // PalsHub API Configuration
  export const PALSHUB_API_BASE_URL: string;

  // App Configuration
  export const APP_URL: string;

  // Feature Flags
  export const ENABLE_PALSHUB_INTEGRATION: string;
  export const ENABLE_AUTHENTICATION: string;
  export const ENABLE_OFFLINE_MODE: string;

  // Google Sign-In Configuration
  export const GOOGLE_IOS_CLIENT_ID: string;
  export const GOOGLE_WEB_CLIENT_ID: string;
}
