/**
 * Firebase Configuration
 *
 * Phase 1: Uses placeholder values for Mock mode.
 * Replace with real Firebase project config when ready to deploy.
 *
 * @phase Phase 1 - Mock Mode
 * @replacement Replace API keys before production deployment
 */

// Mock Firebase configuration for Phase 1
// TODO: Replace with real Firebase config when project is set up
const firebaseConfig = {
  apiKey: 'PLACEHOLDER_API_KEY',
  authDomain: 'pocketpal-ai-mock.firebaseapp.com',
  projectId: 'pocketpal-ai-mock',
  storageBucket: 'pocketpal-ai-mock.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:placeholder',
};

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Get Firebase configuration
 * In Phase 1, returns mock config for development
 */
export function getFirebaseConfig(): FirebaseConfig {
  return firebaseConfig;
}

/**
 * Check if Firebase is configured with real credentials
 * Used to determine if we should use mock services
 */
export function isFirebaseConfigured(): boolean {
  return firebaseConfig.apiKey !== 'PLACEHOLDER_API_KEY';
}

export default firebaseConfig;
