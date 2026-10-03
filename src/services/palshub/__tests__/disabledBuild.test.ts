const mockCreateClient = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

jest.mock('@react-native-firebase/app', () => {
  throw new Error('Firebase app must not load in a disabled build');
});

jest.mock('@react-native-firebase/app-check', () => {
  throw new Error('Firebase App Check must not load in a disabled build');
});

jest.mock('@react-native-google-signin/google-signin', () => {
  throw new Error('Google Sign-In must not load in a disabled build');
});

const describeDisabledBuild = __ENABLE_PALSHUB__ ? describe.skip : describe;

describeDisabledBuild('disabled centralized integrations build', () => {
  it('does not initialize centralized authentication dependencies', () => {
    expect(() => require('../AuthService')).not.toThrow();
    expect(() => require('../supabase')).not.toThrow();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('rejects Firebase App Check without loading its native modules', async () => {
    const {initializeAppCheck, getAppCheckToken} = require('../../../utils/fb');

    await expect(initializeAppCheck()).rejects.toThrow(
      'Firebase App Check is disabled in this build.',
    );
    await expect(getAppCheckToken()).rejects.toThrow(
      'Firebase App Check is disabled in this build.',
    );
  });

  it('rejects PalsHub API calls before making a request', async () => {
    const {palsHubApiService} = require('../PalsHubApiService');

    await expect(palsHubApiService.getPals()).rejects.toThrow(
      'PalsHub API not configured',
    );
  });
});
