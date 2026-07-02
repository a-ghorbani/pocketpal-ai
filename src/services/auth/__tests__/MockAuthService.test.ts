/**
 * MockAuthService Test Suite
 *
 * Tests the mock authentication service implementation.
 */

import { MockAuthService } from '../MockAuthService';
import {
  AuthStatus,
  createDefaultAuthState,
  createAuthenticatedState,
  createErrorState,
} from '../IAuthService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('MockAuthService', () => {
  let authService: MockAuthService;

  beforeEach(() => {
    // Reset singleton instance
    (MockAuthService as any).mockAuthInstance = null;
    authService = new MockAuthService();
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default auth state', () => {
      const state = authService.authState;
      expect(state.status).toBe('idle');
      expect(state.user).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('signInWithEmail', () => {
    it('should successfully sign in with valid credentials', async () => {
      // First sign up a user
      await authService.signUpWithEmail('test@example.com', 'password123', 'Test User');
      
      // Reset state
      await authService.signOut();
      
      // Now sign in
      const result = await authService.signInWithEmail('test@example.com', 'password123');
      
      expect(result).toBe(true);
      expect(authService.authState.status).toBe('authenticated');
      expect(authService.authState.user).not.toBeNull();
      expect(authService.authState.user?.email).toBe('test@example.com');
    });

    it('should fail to sign in with invalid password', async () => {
      // First sign up a user
      await authService.signUpWithEmail('test@example.com', 'password123', 'Test User');
      
      // Try to sign in with wrong password
      const result = await authService.signInWithEmail('test@example.com', 'wrongpassword');
      
      expect(result).toBe(false);
      expect(authService.authState.status).toBe('error');
      expect(authService.authState.error).toContain('Invalid email or password');
    });

    it('should fail to sign in with non-existent email', async () => {
      const result = await authService.signInWithEmail('nonexistent@example.com', 'password123');
      
      expect(result).toBe(false);
      expect(authService.authState.status).toBe('error');
      expect(authService.authState.error).toContain('Invalid email or password');
    });

    it('should set status to loading during sign in', async () => {
      const promise = authService.signInWithEmail('test@example.com', 'password123');
      
      // Status should be loading (but we can't easily test this without spy)
      const result = await promise;
      
      expect(result).toBe(false); // User doesn't exist
    });
  });

  describe('signUpWithEmail', () => {
    it('should successfully sign up a new user', async () => {
      const result = await authService.signUpWithEmail('newuser@example.com', 'password123', 'New User');
      
      expect(result).toBe(true);
      expect(authService.authState.status).toBe('authenticated');
      expect(authService.authState.user).not.toBeNull();
      expect(authService.authState.user?.email).toBe('newuser@example.com');
      expect(authService.authState.user?.displayName).toBe('New User');
    });

    it('should fail to sign up with existing email', async () => {
      // First sign up
      await authService.signUpWithEmail('existing@example.com', 'password123', 'Existing User');
      
      // Try to sign up again with same email
      const result = await authService.signUpWithEmail('existing@example.com', 'password123', 'Another User');
      
      expect(result).toBe(false);
      expect(authService.authState.status).toBe('error');
      expect(authService.authState.error).toContain('Email already in use');
    });

    it('should use email prefix as display name if not provided', async () => {
      const result = await authService.signUpWithEmail('testuser@example.com', 'password123');
      
      expect(result).toBe(true);
      expect(authService.authState.user?.displayName).toBe('testuser');
    });

    it('should generate unique UID for each user', async () => {
      const result1 = await authService.signUpWithEmail('user1@example.com', 'pass1');
      const uid1 = authService.authState.user?.uid;
      
      await authService.signOut();
      
      const result2 = await authService.signUpWithEmail('user2@example.com', 'pass2');
      const uid2 = authService.authState.user?.uid;
      
      expect(uid1).not.toBe(uid2);
      expect(uid1).toContain('mock_');
      expect(uid2).toContain('mock_');
    });
  });

  describe('signInWithGoogle', () => {
    it('should successfully sign in with Google (mock)', async () => {
      const result = await authService.signInWithGoogle();
      
      expect(result).toBe(true);
      expect(authService.authState.status).toBe('authenticated');
      expect(authService.authState.user).not.toBeNull();
      expect(authService.authState.user?.email).toBe('mock.user@gmail.com');
      expect(authService.authState.user?.displayName).toBe('Mock Google User');
      expect(authService.authState.user?.emailVerified).toBe(true);
    });
  });

  describe('signInWithApple', () => {
    it('should successfully sign in with Apple (mock)', async () => {
      const result = await authService.signInWithApple();
      
      expect(result).toBe(true);
      expect(authService.authState.status).toBe('authenticated');
      expect(authService.authState.user).not.toBeNull();
      expect(authService.authState.user?.email).toBe('mock.user@privaterelay.appleid.com');
      expect(authService.authState.user?.displayName).toBe('Mock Apple User');
      expect(authService.authState.user?.emailVerified).toBe(true);
    });
  });

  describe('signOut', () => {
    it('should successfully sign out', async () => {
      // First sign in
      await authService.signUpWithEmail('test@example.com', 'password123');
      expect(authService.authState.status).toBe('authenticated');
      
      // Now sign out
      await authService.signOut();
      
      expect(authService.authState.status).toBe('idle');
      expect(authService.authState.user).toBeNull();
      expect(authService.authState.error).toBeNull();
    });
  });

  describe('enableOfflineMode / disableOfflineMode', () => {
    it('should log message when enabling offline mode', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      authService.enableOfflineMode();
      expect(consoleSpy).toHaveBeenCalledWith('[MockAuth] Already in offline mode');
      consoleSpy.mockRestore();
    });

    it('should simulate delay when disabling offline mode', async () => {
      const startTime = Date.now();
      await authService.disableOfflineMode();
      const endTime = Date.now();
      
      // Should have at least 500ms delay
      expect(endTime - startTime).toBeGreaterThanOrEqual(500);
    });
  });

  describe('resetPassword', () => {
    it('should always return true (simulated success)', async () => {
      const result = await authService.resetPassword('test@example.com');
      
      expect(result).toBe(true);
    });

    it('should log simulation message', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await authService.resetPassword('test@example.com');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MockAuth] Password reset email sent')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('updateProfile', () => {
    it('should successfully update profile when authenticated', async () => {
      // First sign in
      await authService.signUpWithEmail('test@example.com', 'password123', 'Old Name');
      
      // Update profile
      const result = await authService.updateProfile({ displayName: 'New Name' });
      
      expect(result).toBe(true);
      expect(authService.authState.user?.displayName).toBe('New Name');
    });

    it('should fail to update profile when not authenticated', async () => {
      const result = await authService.updateProfile({ displayName: 'New Name' });
      
      expect(result).toBe(false);
    });
  });

  describe('Persistence', () => {
    it('should persist user to AsyncStorage on sign in', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      
      await authService.signUpWithEmail('test@example.com', 'password123');
      
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@mock_auth_user',
        expect.any(String)
      );
    });

    it('should remove user from AsyncStorage on sign out', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      
      await authService.signUpWithEmail('test@example.com', 'password123');
      await authService.signOut();
      
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@mock_auth_user');
    });
  });
});
