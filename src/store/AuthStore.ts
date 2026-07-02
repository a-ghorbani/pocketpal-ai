/**
 * AuthStore - Authentication State Management
 *
 * MobX store for managing authentication state across the app.
 * Integrates with IAuthService for login/logout operations.
 *
 * @phase Phase 1 - Authentication Store
 */

import { makeAutoObservable, runInAction } from 'mobx';
import { makePersistable } from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  IAuthService,
  AuthState,
  AuthUser,
  AuthStatus,
  createDefaultAuthState,
} from '../services/auth/IAuthService';
import { authService } from '../services/auth/AuthServiceFactory';

export type OfflineMode = boolean;

/**
 * AuthStore - Manages authentication state and offline mode
 *
 * Features:
 * - Login/logout with any IAuthService implementation
 * - Offline mode support (uses MockAuthService)
 * - Persistent auth state via mobx-persist-store
 * - Auto-login on app start (loaded from persistence)
 */
export class AuthStore {
  // ========== Observable State ==========

  /**
   * Current authentication state
   * Includes status, user, and error information
   */
  authState: AuthState = createDefaultAuthState();

  /**
   * Whether the app is in offline mode
   * In offline mode, uses MockAuthService (local only)
   */
  isOfflineMode: boolean = false;

  /**
   * Whether the store has been hydrated from persistence
   * Useful for splash screen timing
   */
  isHydrated: boolean = false;

  /**
   * Loading flag for UI feedback
   */
  get isLoading(): boolean {
    return this.authState.status === 'loading';
  }

  /**
   * Whether user is authenticated
   */
  get isAuthenticated(): boolean {
    return this.authState.status === 'authenticated' && this.authState.user !== null;
  }

  /**
   * Current user (shorthand)
   */
  get user(): AuthUser | null {
    return this.authState.user;
  }

  /**
   * Current error (shorthand)
   */
  get error(): string | null {
    return this.authState.error;
  }

  // ========== Constructor ==========

  constructor() {
    makeAutoObservable(this);

    makePersistable(this, {
      name: 'AuthStore',
      properties: ['authState', 'isOfflineMode'],
      storage: AsyncStorage,
    }).then(() => {
      runInAction(() => {
        this.isHydrated = true;
      });

      // Auto-login: if we have persisted auth state, validate it
      if (this.isAuthenticated) {
        console.log('[AuthStore] Restored authenticated state from storage');
      }
    });
  }

  // ========== Actions ==========

  /**
   * Sign in with email and password
   * @param email - User's email
   * @param password - User's password
   * @returns Promise<boolean> - true if successful
   */
  async signInWithEmail(email: string, password: string): Promise<boolean> {
    runInAction(() => {
      this.authState = { ...this.authState, status: 'loading', error: null };
    });

    try {
      const success = await authService.signInWithEmail(email, password);

      if (success) {
        const user = authService.authState.user;
        runInAction(() => {
          this.authState = {
            status: 'authenticated',
            user,
            error: null,
          };
        });
        return true;
      } else {
        runInAction(() => {
          this.authState = {
            status: 'error',
            user: null,
            error: authService.authState.error || 'Login failed',
          };
        });
        return false;
      }
    } catch (error) {
      runInAction(() => {
        this.authState = {
          status: 'error',
          user: null,
          error: error instanceof Error ? error.message : 'Login failed',
        };
      });
      return false;
    }
  }

  /**
   * Sign up with email and password
   * @param email - User's email
   * @param password - User's password
   * @param displayName - Optional display name
   * @returns Promise<boolean> - true if successful
   */
  async signUpWithEmail(
    email: string,
    password: string,
    displayName?: string
  ): Promise<boolean> {
    runInAction(() => {
      this.authState = { ...this.authState, status: 'loading', error: null };
    });

    try {
      const success = await authService.signUpWithEmail(email, password, displayName);

      if (success) {
        const user = authService.authState.user;
        runInAction(() => {
          this.authState = {
            status: 'authenticated',
            user,
            error: null,
          };
        });
        return true;
      } else {
        runInAction(() => {
          this.authState = {
            status: 'error',
            user: null,
            error: authService.authState.error || 'Sign up failed',
          };
        });
        return false;
      }
    } catch (error) {
      runInAction(() => {
        this.authState = {
          status: 'error',
          user: null,
          error: error instanceof Error ? error.message : 'Sign up failed',
        };
      });
      return false;
    }
  }

  /**
   * Sign in with Google OAuth
   * @returns Promise<boolean> - true if successful
   */
  async signInWithGoogle(): Promise<boolean> {
    runInAction(() => {
      this.authState = { ...this.authState, status: 'loading', error: null };
    });

    try {
      const success = await authService.signInWithGoogle();

      if (success) {
        const user = authService.authState.user;
        runInAction(() => {
          this.authState = {
            status: 'authenticated',
            user,
            error: null,
          };
        });
        return true;
      } else {
        runInAction(() => {
          this.authState = {
            status: 'error',
            user: null,
            error: authService.authState.error || 'Google login failed',
          };
        });
        return false;
      }
    } catch (error) {
      runInAction(() => {
        this.authState = {
          status: 'error',
          user: null,
          error: error instanceof Error ? error.message : 'Google login failed',
        };
      });
      return false;
    }
  }

  /**
   * Sign in with Apple OAuth
   * @returns Promise<boolean> - true if successful
   */
  async signInWithApple(): Promise<boolean> {
    runInAction(() => {
      this.authState = { ...this.authState, status: 'loading', error: null };
    });

    try {
      const success = await authService.signInWithApple();

      if (success) {
        const user = authService.authState.user;
        runInAction(() => {
          this.authState = {
            status: 'authenticated',
            user,
            error: null,
          };
        });
        return true;
      } else {
        runInAction(() => {
          this.authState = {
            status: 'error',
            user: null,
            error: authService.authState.error || 'Apple login failed',
          };
        });
        return false;
      }
    } catch (error) {
      runInAction(() => {
        this.authState = {
          status: 'error',
          user: null,
          error: error instanceof Error ? error.message : 'Apple login failed',
        };
      });
      return false;
    }
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    runInAction(() => {
      this.authState = { ...this.authState, status: 'loading' };
    });

    try {
      await authService.signOut();
      runInAction(() => {
        this.authState = createDefaultAuthState();
      });
    } catch (error) {
      console.error('[AuthStore] Sign out error:', error);
      // Force sign out locally even if remote fails
      runInAction(() => {
        this.authState = createDefaultAuthState();
      });
    }
  }

  /**
   * Enable offline mode
   * Switches to MockAuthService for local-only authentication
   */
  enableOfflineMode(): void {
    authService.enableOfflineMode();
    runInAction(() => {
      this.isOfflineMode = true;
    });
    console.log('[AuthStore] Offline mode enabled');
  }

  /**
   * Disable offline mode
   * Attempts to switch back to Firebase (if configured)
   */
  async disableOfflineMode(): Promise<void> {
    runInAction(() => {
      this.authState = { ...this.authState, status: 'loading' };
    });

    try {
      await authService.disableOfflineMode();
      runInAction(() => {
        this.isOfflineMode = false;
        this.authState = { ...this.authState, status: 'idle' };
      });
      console.log('[AuthStore] Offline mode disabled');
    } catch (error) {
      runInAction(() => {
        this.authState = {
          status: 'error',
          user: null,
          error: error instanceof Error ? error.message : 'Failed to disable offline mode',
        };
      });
    }
  }

  /**
   * Clear any authentication error
   */
  clearError(): void {
    runInAction(() => {
      this.authState = { ...this.authState, error: null };
    });
  }

  /**
   * Reset store to default state
   * Useful for logout or error recovery
   */
  reset(): void {
    runInAction(() => {
      this.authState = createDefaultAuthState();
      this.isOfflineMode = false;
    });
  }
}

// Singleton instance
export const authStore = new AuthStore();
