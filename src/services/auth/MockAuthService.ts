/**
 * Mock Authentication Service
 *
 * In-memory authentication for offline mode and development.
 * Simulates Firebase Auth behavior without network calls.
 *
 * @phase Phase 1 - Mock Implementation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  IAuthService,
  AuthState,
  AuthUser,
  AuthStatus,
  createDefaultAuthState,
  createAuthenticatedState,
  createErrorState,
} from './IAuthService';

const STORAGE_KEY = '@mock_auth_user';

/**
 * MockAuthService - Local authentication simulation
 *
 * Features:
 * - In-memory user storage
 * - AsyncStorage persistence
 * - Simulated network delay
 * - Mock user database
 */
export class MockAuthService implements IAuthService {
  private _authState: AuthState = createDefaultAuthState();
  private mockUsers: Map<string, { user: AuthUser; password: string }> = new Map();

  constructor() {
    this.loadPersistedUser();
  }

  /**
   * Current authentication state (observable)
   */
  get authState(): AuthState {
    return this._authState;
  }

  /**
   * Simulate network delay for realistic UX
   */
  private async simulateDelay(ms: number = 500): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Load persisted user from AsyncStorage
   */
  private async loadPersistedUser(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const user = JSON.parse(stored) as AuthUser;
        this._authState = createAuthenticatedState(user);
      }
    } catch (error) {
      console.error('[MockAuth] Failed to load persisted user:', error);
    }
  }

  /**
   * Persist user to AsyncStorage
   */
  private async persistUser(user: AuthUser | null): Promise<void> {
    try {
      if (user) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('[MockAuth] Failed to persist user:', error);
    }
  }

  /**
   * Sign in with email and password
   * Validates against mock user database
   */
  async signInWithEmail(email: string, password: string): Promise<boolean> {
    this._authState = { ...this._authState, status: 'loading', error: null };

    await this.simulateDelay();

    const mockUser = this.mockUsers.get(email);

    if (mockUser && mockUser.password === password) {
      const state = createAuthenticatedState(mockUser.user);
      this._authState = state;
      await this.persistUser(mockUser.user);
      return true;
    }

    this._authState = createErrorState('Invalid email or password');
    return false;
  }

  /**
   * Sign up with email and password
   * Creates a new mock user
   */
  async signUpWithEmail(
    email: string,
    password: string,
    displayName?: string
  ): Promise<boolean> {
    this._authState = { ...this._authState, status: 'loading', error: null };

    await this.simulateDelay();

    if (this.mockUsers.has(email)) {
      this._authState = createErrorState('Email already in use');
      return false;
    }

    const newUser: AuthUser = {
      uid: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      displayName: displayName || email.split('@')[0],
      photoURL: null,
      emailVerified: false,
    };

    this.mockUsers.set(email, { user: newUser, password });
    const state = createAuthenticatedState(newUser);
    this._authState = state;
    await this.persistUser(newUser);
    return true;
  }

  /**
   * Sign in with Google (Mock)
   * Simulates a successful Google OAuth login
   */
  async signInWithGoogle(): Promise<boolean> {
    this._authState = { ...this._authState, status: 'loading', error: null };

    await this.simulateDelay(800);

    const mockGoogleUser: AuthUser = {
      uid: `mock_google_${Date.now()}`,
      email: 'mock.user@gmail.com',
      displayName: 'Mock Google User',
      photoURL: 'https://via.placeholder.com/150',
      emailVerified: true,
    };

    const state = createAuthenticatedState(mockGoogleUser);
    this._authState = state;
    await this.persistUser(mockGoogleUser);
    return true;
  }

  /**
   * Sign in with Apple (Mock)
   * Simulates a successful Apple OAuth login
   */
  async signInWithApple(): Promise<boolean> {
    this._authState = { ...this._authState, status: 'loading', error: null };

    await this.simulateDelay(800);

    const mockAppleUser: AuthUser = {
      uid: `mock_apple_${Date.now()}`,
      email: 'mock.user@privaterelay.appleid.com',
      displayName: 'Mock Apple User',
      photoURL: null,
      emailVerified: true,
    };

    const state = createAuthenticatedState(mockAppleUser);
    this._authState = state;
    await this.persistUser(mockAppleUser);
    return true;
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    this._authState = { ...this._authState, status: 'loading' };

    await this.simulateDelay(300);

    this._authState = createDefaultAuthState();
    await this.persistUser(null);
  }

  /**
   * Enable offline mode
   * Already in offline mode (this is the offline implementation)
   */
  enableOfflineMode(): void {
    console.log('[MockAuth] Already in offline mode');
  }

  /**
   * Disable offline mode
   * In Phase 1, stays in mock mode (Firebase not configured)
   */
  async disableOfflineMode(): Promise<void> {
    console.log('[MockAuth] Firebase not configured, staying in mock mode');
    await this.simulateDelay(500);
  }

  /**
   * Reset password (Mock)
   * Always returns true (simulated success)
   */
  async resetPassword(email: string): Promise<boolean> {
    await this.simulateDelay(500);
    console.log(`[MockAuth] Password reset email sent to ${email} (simulated)`);
    return true;
  }

  /**
   * Update user profile (Mock)
   */
  async updateProfile(updates: Partial<AuthUser>): Promise<boolean> {
    if (!this._authState.user) {
      return false;
    }

    const updatedUser = { ...this._authState.user, ...updates };
    this._authState = createAuthenticatedState(updatedUser);
    await this.persistUser(updatedUser);

    // Update in mock database if exists
    if (updatedUser.email) {
      const existing = this.mockUsers.get(updatedUser.email);
      if (existing) {
        existing.user = updatedUser;
      }
    }

    return true;
  }
}

// Singleton instance
let mockAuthInstance: MockAuthService | null = null;

/**
 * Get the singleton MockAuthService instance
 */
export function getMockAuthService(): MockAuthService {
  if (!mockAuthInstance) {
    mockAuthInstance = new MockAuthService();
  }
  return mockAuthInstance;
}
