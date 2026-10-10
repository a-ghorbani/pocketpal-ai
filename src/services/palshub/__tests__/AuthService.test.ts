// Tests for AuthService.loadUserProfile column-narrowing and no-rows handling

describe('AuthService.loadUserProfile', () => {
  const setup = (singleResult: {data: any; error: any}) => {
    jest.resetModules();
    jest.clearAllMocks();

    const single = jest.fn().mockResolvedValue(singleResult);
    const eq = jest.fn(() => ({single}));
    const select = jest.fn(() => ({eq}));
    const from = jest.fn(() => ({select}));

    jest.doMock('../supabase', () => ({
      supabase: {
        from,
        auth: {
          onAuthStateChange: jest.fn(),
          getSession: jest
            .fn()
            .mockResolvedValue({data: {session: null}, error: null}),
        },
      },
    }));

    const {authService} = require('../AuthService');
    return {authService, from, select, eq, single};
  };

  it('selects only the granted columns and populates profile', async () => {
    const row = {
      id: 'u1',
      username: 'pocket',
      full_name: 'Pocket Pal',
      avatar_url: 'https://example.com/a.png',
    };
    const {authService, select} = setup({data: row, error: null});

    await (authService as any).loadUserProfile('u1');

    expect(select).toHaveBeenCalledWith('id, username, full_name, avatar_url');
    expect(authService.profile).toEqual(row);
  });

  it('handles the PGRST116 no-rows path without throwing and leaves profile unchanged', async () => {
    const {authService} = setup({data: null, error: {code: 'PGRST116'}});

    const before = authService.profile;
    await expect(
      (authService as any).loadUserProfile('u1'),
    ).resolves.toBeUndefined();
    expect(authService.profile).toBe(before);
  });

  it('returns early on a permission-denied error without throwing and leaves profile unchanged', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const {authService} = setup({
      data: null,
      error: {code: '42501', message: 'permission denied for table profiles'},
    });

    const before = authService.profile;
    await expect(
      (authService as any).loadUserProfile('u1'),
    ).resolves.toBeUndefined();
    expect(authService.profile).toBe(before);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('AuthService.signOut', () => {
  it('leaves the purchase ledger and local Pals untouched', async () => {
    jest.resetModules();
    const removeItem = jest.fn();
    const clear = jest.fn();
    const multiRemove = jest.fn();
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      getItem: jest.fn(async () => null),
      setItem: jest.fn(),
      removeItem,
      clear,
      multiRemove,
    }));
    jest.doMock('../supabase', () => ({
      supabase: {
        auth: {
          onAuthStateChange: jest.fn(),
          getSession: jest
            .fn()
            .mockResolvedValue({data: {session: null}, error: null}),
          signOut: jest.fn().mockResolvedValue({error: null}),
        },
      },
    }));
    const deletePal = jest.fn();
    jest.doMock('../../../repositories/PalRepository', () => ({
      palRepository: {deletePal},
    }));

    const {authService} = require('../AuthService');
    await authService.signOut();

    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(multiRemove).not.toHaveBeenCalled();
    expect(deletePal).not.toHaveBeenCalled();
  });
});

describe('AuthService.signInWithApple', () => {
  const appleResponse = {
    identityToken: 'apple-id-token',
    nonce: 'raw-nonce',
    fullName: null,
  };

  const setup = ({
    env,
    signInResult = {data: {user: {id: 'u1'}}, error: null},
    profileUpdateResult = {error: null},
    updateUserResult = {data: {}, error: null},
    storedProfile = {id: 'u1', full_name: 'Reloaded'},
    signInEmitsSignedIn = false,
  }: {
    env?: Record<string, string>;
    signInResult?: {data: any; error: any};
    profileUpdateResult?: {error: any};
    updateUserResult?: {data: any; error: any};
    storedProfile?: {id: string; full_name: string | null};
    signInEmitsSignedIn?: boolean;
  } = {}) => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    if (env) {
      jest.doMock('@env', () => env);
    }

    let authStateListener: (event: string, session: any) => Promise<void>;
    const onAuthStateChange = jest.fn(listener => {
      authStateListener = listener;
    });
    const signInWithIdToken = jest.fn(async () => {
      if (signInEmitsSignedIn) {
        await authStateListener('SIGNED_IN', {user: {id: 'u1'}});
      }
      return signInResult;
    });
    const updateUser = jest.fn().mockResolvedValue(updateUserResult);
    const updateEq = jest.fn().mockResolvedValue(profileUpdateResult);
    const update = jest.fn(() => ({eq: updateEq}));
    const single = jest
      .fn()
      .mockResolvedValue({data: storedProfile, error: null});
    const select = jest.fn(() => ({eq: jest.fn(() => ({single}))}));
    const upsert = jest.fn();
    const insert = jest.fn();
    const from = jest.fn(() => ({select, update, upsert, insert}));
    jest.doMock('../supabase', () => ({
      supabase: {
        from,
        auth: {
          onAuthStateChange,
          getSession: jest
            .fn()
            .mockResolvedValue({data: {session: null}, error: null}),
          signInWithIdToken,
          updateUser,
        },
      },
    }));

    const {appleAuth} = require('@invertase/react-native-apple-authentication');
    const {authService} = require('../AuthService');
    return {
      authService,
      appleAuth,
      signInWithIdToken,
      updateUser,
      update,
      updateEq,
      select,
      upsert,
      insert,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('@env');
  });

  it('requests email and name and sends the raw nonce to Supabase', async () => {
    const {authService, appleAuth, signInWithIdToken} = setup();
    appleAuth.performRequest.mockResolvedValue(appleResponse);

    await authService.signInWithApple();

    expect(appleAuth.performRequest).toHaveBeenCalledWith({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-id-token',
      nonce: 'raw-nonce',
    });
    expect(authService.error).toBeNull();
    expect(authService.isLoading).toBe(false);
  });

  describe('error messages', () => {
    const {AuthApiError, AuthRetryableFetchError} = jest.requireActual(
      '@supabase/supabase-js',
    );

    const failSupabase = async (supabaseError: unknown) => {
      const ctx = setup({
        signInResult: {data: {user: null}, error: supabaseError},
      });
      ctx.appleAuth.performRequest.mockResolvedValue(appleResponse);
      await ctx.authService.signInWithApple();
      return ctx;
    };

    const failApple = async (code: string) => {
      const ctx = setup();
      ctx.appleAuth.performRequest.mockRejectedValue({code});
      await ctx.authService.signInWithApple();
      return ctx;
    };

    it('asks to check the connection when the auth server is unreachable', async () => {
      const fetchError = new AuthRetryableFetchError(
        '{"headers":{"map":{"server":"kong"}},"url":"http://10.0.0.1:54321/auth/v1/token"}',
        0,
      );
      const {authService} = await failSupabase(fetchError);

      expect(authService.error).toBe(
        "Couldn't reach the server. Check your connection and try again.",
      );
      expect(console.error).toHaveBeenCalledWith(
        'Supabase Apple sign-in error:',
        fetchError,
      );
      expect(authService.isAuthenticated).toBe(false);
      expect(authService.isLoading).toBe(false);
    });

    it('asks to check the connection on a 5xx response', async () => {
      const {authService} = await failSupabase(
        new AuthApiError(
          'Database error saving new user',
          500,
          'unexpected_failure',
        ),
      );

      expect(authService.error).toBe(
        "Couldn't reach the server. Check your connection and try again.",
      );
    });

    it('reports Apple sign-in as unavailable on a 4xx auth API error', async () => {
      const {authService} = await failSupabase(
        new AuthApiError(
          'Provider (issuer "https://appleid.apple.com") is not enabled',
          400,
          'provider_disabled',
        ),
      );

      expect(authService.error).toBe(
        "Sign in with Apple isn't available right now. Please try again later or use another sign-in method.",
      );
    });

    it('reports a cancelled Apple sheet as a warning without calling Supabase', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const {authService, signInWithIdToken} = await failApple('1001');

      expect(signInWithIdToken).not.toHaveBeenCalled();
      expect(authService.error).toBe('Sign-in was cancelled');
      expect(warnSpy).toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
      expect(authService.isLoading).toBe(false);
    });

    it('asks to sign in to an Apple Account on an unknown Apple error', async () => {
      const {authService, signInWithIdToken} = await failApple('1000');

      expect(signInWithIdToken).not.toHaveBeenCalled();
      expect(authService.error).toBe(
        'Sign in to your Apple Account in Settings to use Sign in with Apple.',
      );
    });

    it('reports any other Apple failure generically', async () => {
      const {authService} = await failApple('1004');

      expect(authService.error).toBe(
        'Sign in with Apple failed. Please try again.',
      );
      expect(console.error).toHaveBeenCalledWith('Apple sign-in error:', {
        code: '1004',
      });
    });

    it('reports a missing identity token generically without calling Supabase', async () => {
      const ctx = setup();
      ctx.appleAuth.performRequest.mockResolvedValue({
        ...appleResponse,
        identityToken: null,
      });

      await ctx.authService.signInWithApple();

      expect(ctx.signInWithIdToken).not.toHaveBeenCalled();
      expect(ctx.authService.error).toBe(
        'Sign in with Apple failed. Please try again.',
      );
    });
  });

  it('does nothing but report when Supabase is not configured', async () => {
    const {authService, appleAuth, signInWithIdToken} = setup({
      env: {SUPABASE_URL: '', SUPABASE_ANON_KEY: ''},
    });

    await authService.signInWithApple();

    expect(appleAuth.performRequest).not.toHaveBeenCalled();
    expect(signInWithIdToken).not.toHaveBeenCalled();
    expect(authService.error).toBe('Authentication not configured');
  });

  describe('first sign-in name', () => {
    const named = (givenName: string | null, familyName: string | null) => ({
      ...appleResponse,
      fullName: {givenName, familyName},
    });

    it('stores the Apple name in user metadata and the profile row, then reloads the profile', async () => {
      const ctx = setup();
      ctx.appleAuth.performRequest.mockResolvedValue(named('Ada', 'Lovelace'));

      await ctx.authService.signInWithApple();

      expect(ctx.updateUser).toHaveBeenCalledWith({
        data: {full_name: 'Ada Lovelace'},
      });
      expect(ctx.update).toHaveBeenCalledWith({
        full_name: 'Ada Lovelace',
        updated_at: expect.any(String),
      });
      expect(ctx.updateEq).toHaveBeenCalledWith('id', 'u1');
      expect(ctx.select).toHaveBeenCalledTimes(1);
      expect(ctx.authService.profile).toEqual({
        id: 'u1',
        full_name: 'Reloaded',
      });
      expect(ctx.upsert).not.toHaveBeenCalled();
      expect(ctx.insert).not.toHaveBeenCalled();
      expect(ctx.authService.error).toBeNull();
    });

    it('stores the name over the nameless profile row loaded on SIGNED_IN', async () => {
      const ctx = setup({
        storedProfile: {id: 'u1', full_name: null},
        signInEmitsSignedIn: true,
      });
      ctx.appleAuth.performRequest.mockResolvedValue(named('Ada', 'Lovelace'));

      await ctx.authService.signInWithApple();

      expect(ctx.updateUser).toHaveBeenCalledWith({
        data: {full_name: 'Ada Lovelace'},
      });
      expect(ctx.update).toHaveBeenCalledWith({
        full_name: 'Ada Lovelace',
        updated_at: expect.any(String),
      });
      expect(ctx.updateEq).toHaveBeenCalledWith('id', 'u1');
      expect(ctx.select).toHaveBeenCalledTimes(2);
    });

    it('trims the parts and uses the only non-empty one', async () => {
      const ctx = setup();
      ctx.appleAuth.performRequest.mockResolvedValue(named('  ', ' Ada '));

      await ctx.authService.signInWithApple();

      expect(ctx.updateUser).toHaveBeenCalledWith({data: {full_name: 'Ada'}});
    });

    it('writes nothing when Apple returns no name', async () => {
      const ctx = setup();
      ctx.appleAuth.performRequest.mockResolvedValue(appleResponse);

      await ctx.authService.signInWithApple();

      expect(ctx.updateUser).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
      expect(ctx.select).not.toHaveBeenCalled();
    });

    it('keeps a name the profile already has', async () => {
      const ctx = setup();
      ctx.authService.profile = {id: 'u1', full_name: 'Edited Name'};
      ctx.appleAuth.performRequest.mockResolvedValue(named('Ada', 'Lovelace'));

      await ctx.authService.signInWithApple();

      expect(ctx.updateUser).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
    });

    it('ignores a name left over from another user profile', async () => {
      const ctx = setup();
      ctx.authService.profile = {id: 'someone-else', full_name: 'Other'};
      ctx.appleAuth.performRequest.mockResolvedValue(named('Ada', 'Lovelace'));

      await ctx.authService.signInWithApple();

      expect(ctx.update).toHaveBeenCalled();
    });

    it('stays signed in without an error when the profile write fails', async () => {
      const ctx = setup({
        profileUpdateResult: {error: {message: 'permission denied'}},
      });
      ctx.appleAuth.performRequest.mockResolvedValue(named('Ada', 'Lovelace'));

      await ctx.authService.signInWithApple();

      expect(ctx.updateUser).toHaveBeenCalled();
      expect(ctx.select).toHaveBeenCalledTimes(1);
      expect(ctx.authService.error).toBeNull();
      expect(ctx.authService.isLoading).toBe(false);
    });

    it('still writes the profile row when the metadata update rejects', async () => {
      const ctx = setup();
      ctx.updateUser.mockRejectedValue(new Error('network'));
      ctx.appleAuth.performRequest.mockResolvedValue(named('Ada', 'Lovelace'));

      await ctx.authService.signInWithApple();

      expect(ctx.update).toHaveBeenCalled();
      expect(ctx.select).toHaveBeenCalledTimes(1);
      expect(ctx.authService.error).toBeNull();
    });

    it('writes no name when Supabase rejects the token', async () => {
      const ctx = setup({
        signInResult: {data: {user: null}, error: {message: 'bad token'}},
      });
      ctx.appleAuth.performRequest.mockResolvedValue(named('Ada', 'Lovelace'));

      await ctx.authService.signInWithApple();

      expect(ctx.updateUser).not.toHaveBeenCalled();
      expect(ctx.update).not.toHaveBeenCalled();
    });
  });
});
