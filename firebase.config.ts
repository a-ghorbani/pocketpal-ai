/**
 * Firebase Configuration
 *
 * Reads Firebase config from environment variables (react-native-dotenv via @env).
 * Falls back to placeholder values when not configured, enabling mock mode
 * for local development without a Firebase project.
 *
 * To enable Firebase: set FIREBASE_API_KEY and related env vars in your .env file.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const PLACEHOLDER = 'PLACEHOLDER_API_KEY';

// Read from env (react-native-dotenv), fall back to placeholders.
// Using a try/catch dynamic import pattern so test environments without
// the babel transform still load this module without crashing.
let env: Record<string, string> = {};
try {
  // @ts-ignore — @env is resolved at build time by react-native-dotenv
  env = require('@env');
} catch {
  // In test/non-transformed contexts, fall through to placeholders
}

const apiKey = env.FIREBASE_API_KEY || PLACEHOLDER;
const projectId = env.FIREBASE_PROJECT_ID || 'pocketpal-ai-mock';

const firebaseConfig: FirebaseConfig = {
  apiKey,
  authDomain: projectId
    ? `${projectId}.firebaseapp.com`
    : 'pocketpal-ai-mock.firebaseapp.com',
  projectId,
  storageBucket: projectId
    ? `${projectId}.appspot.com`
    : 'pocketpal-ai-mock.appspot.com',
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: env.FIREBASE_APP_ID || '1:000000000000:web:placeholder',
};

/**
 * Get Firebase configuration
 */
export function getFirebaseConfig(): FirebaseConfig {
  return firebaseConfig;
}

/**
 * Check if Firebase is configured with real credentials.
 * Used to determine if we should use mock services.
 */
export function isFirebaseConfigured(): boolean {
  return firebaseConfig.apiKey !== PLACEHOLDER;
}

export default firebaseConfig;
