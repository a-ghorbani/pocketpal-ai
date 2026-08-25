// Mock for src/services/palshub/AuthService.ts
// This mock avoids the @env import issue by providing a complete mock implementation

const {makeAutoObservable} = require('mobx');

const authService = makeAutoObservable(
  {
    user: null,
    profile: null,
    session: null,
    isLoading: false,
    isAuthenticated: false,
    error: null,

    signInWithGoogle: jest.fn().mockResolvedValue(undefined),
    signInWithEmail: jest.fn().mockResolvedValue(true),
    signUpWithEmail: jest.fn().mockResolvedValue(true),
    signOut: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(true),
    updateProfile: jest.fn().mockResolvedValue(undefined),
    clearError: jest.fn(),

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
  },
  {
    signInWithGoogle: false,
    signInWithEmail: false,
    signUpWithEmail: false,
    signOut: false,
    resetPassword: false,
    updateProfile: false,
    clearError: false,
  },
);

// Export the mock service
export default authService;

// Named export for compatibility
export {authService};

// CommonJS compatibility
module.exports = authService;
module.exports.default = authService;
module.exports.authService = authService;
