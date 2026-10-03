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
