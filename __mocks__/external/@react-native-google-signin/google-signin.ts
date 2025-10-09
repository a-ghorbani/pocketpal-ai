export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn().mockResolvedValue(true),
  isSignedIn: jest.fn().mockResolvedValue(false),
  signIn: jest.fn().mockResolvedValue({idToken: 'test', user: {}}),
  signOut: jest.fn(),
  revokeAccess: jest.fn(),
  getTokens: jest
    .fn()
    .mockResolvedValue({idToken: 'test', accessToken: 'test'}),
  signInSilently: jest.fn().mockRejectedValue(new Error('Not signed in')),
};
