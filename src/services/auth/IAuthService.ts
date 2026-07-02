/**
 * Authentication Service Interface
 *
 * Defines the contract for authentication services.
 * Implementations: FirebaseAuthService (real), MockAuthService (offline/mock)
 *
 * @phase Phase 1 - Interface Definition
 */

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
}

/**
 * IAuthService - Authentication service interface
 *
 * All authentication implementations must adhere to this interface.
 * This allows swapping between Firebase and Mock implementations.
 */
export interface IAuthService {
  /**
   * Current authentication state
   */
  authState: AuthState;

  /**
   * Sign in with email and password
   * @param email - User's email address
   * @param password - User's password
   * @returns Promise<boolean> - true if successful
   */
  signInWithEmail(email: string, password: string): Promise<boolean>;

  /**
   * Sign up with email and password
   * @param email - User's email address
   * @param password - User's password (min 6 chars)
   * @param displayName - Optional display name
   * @returns Promise<boolean> - true if successful
   */
  signUpWithEmail(email: string, password: string, displayName?: string): Promise<boolean>;

  /**
   * Sign in with Google OAuth
   * @returns Promise<boolean> - true if successful
   */
  signInWithGoogle(): Promise<boolean>;

  /**
   * Sign in with Apple OAuth
   * @returns Promise<boolean> - true if successful
   */
  signInWithApple(): Promise<boolean>;

  /**
   * Sign out the current user
   * @returns Promise<void>
   */
  signOut(): Promise<void>;

  /**
   * Enable offline mode (uses MockAuthService)
   * No network calls, local storage only
   */
  enableOfflineMode(): void;

  /**
   * Disable offline mode (uses Firebase if configured)
   * Attempts to reconnect to remote auth
   * @returns Promise<void>
   */
  disableOfflineMode(): Promise<void>;

  /**
   * Reset password via email
   * @param email - User's email address
   * @returns Promise<boolean> - true if email sent
   */
  resetPassword?(email: string): Promise<boolean>;

  /**
   * Update user profile
   * @param updates - Partial user data to update
   * @returns Promise<boolean> - true if successful
   */
  updateProfile?(updates: Partial<AuthUser>): Promise<boolean>;
}

/**
 * Default AuthState factory
 */
export function createDefaultAuthState(): AuthState {
  return {
    status: 'idle',
    user: null,
    error: null,
  };
}

/**
 * Create an authenticated state
 * @param user - Authenticated user data
 */
export function createAuthenticatedState(user: AuthUser): AuthState {
  return {
    status: 'authenticated',
    user,
    error: null,
  };
}

/**
 * Create an error state
 * @param error - Error message
 */
export function createErrorState(error: string): AuthState {
  return {
    status: 'error',
    user: null,
    error,
  };
}
