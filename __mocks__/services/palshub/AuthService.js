// Mock for src/services/palshub/AuthService.ts
// This mock avoids the @env import issue by providing a complete mock implementation

const mockProfile = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: null,
};

const mockAuthService = {
  // Observable properties (mutable for tests)
  isAuthenticated: false,
  user: null,
  profile: null,
  session: null,
  isLoading: false,
  error: null,
  isInitialized: true,

  // Methods
  signInWithEmail: jest.fn().mockResolvedValue(undefined),

  signUpWithEmail: jest.fn().mockResolvedValue(undefined),

  signInWithGoogle: jest.fn().mockResolvedValue({
    success: true,
    user: mockProfile,
  }),

  resetPassword: jest.fn().mockResolvedValue(undefined),

  signOut: jest.fn().mockResolvedValue({
    success: true,
  }),

  refreshSession: jest.fn().mockResolvedValue({
    success: true,
  }),

  updateProfile: jest.fn().mockResolvedValue({
    success: true,
    profile: mockProfile,
  }),

  deleteAccount: jest.fn().mockResolvedValue({
    success: true,
  }),

  clearError: jest.fn(),

  // Initialization method
  initialize: jest.fn().mockResolvedValue(true),

  // Getters
  get isSupabaseConfigured() {
    return true;
  },

  get currentUser() {
    return this.user;
  },

  get currentProfile() {
    return this.profile;
  },

  get authState() {
    return {
      user: this.user,
      profile: this.profile,
      session: this.session,
      isLoading: this.isLoading,
      isAuthenticated: this.isAuthenticated,
      error: this.error,
    };
  },

  // Private methods (mocked for completeness)
  initAuthListener: jest.fn(),
  handleAuthStateChange: jest.fn(),
  createOrUpdateProfile: jest.fn().mockResolvedValue(mockProfile),
  fetchProfile: jest.fn().mockResolvedValue(mockProfile),
};

// Create a singleton instance
const authService = mockAuthService;

// Export the mock service
export default authService;

// Named export for compatibility
export {authService};

// CommonJS compatibility
module.exports = authService;
module.exports.default = authService;
module.exports.authService = authService;
