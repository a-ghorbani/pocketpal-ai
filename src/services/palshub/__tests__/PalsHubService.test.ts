jest.mock('../AuthService', () => ({
  authService: {isAuthenticated: false, user: null},
}));

jest.mock('../PalsHubApiService', () => ({
  palsHubApiService: {
    getPal: jest.fn(),
  },
}));

describe('PalsHubService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('checkPalOwnership returns owned=false when unauthenticated', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: false, user: null},
    }));
    const {palsHubService} = require('../PalsHubService');
    await expect(palsHubService.checkPalOwnership('pal-1')).resolves.toEqual({
      owned: false,
    });
  });

  it('checkPalOwnership returns owned flag based on pal.is_owned', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: true, user: {id: 'u1'}},
    }));
    const {palsHubApiService} = require('../PalsHubApiService');
    (palsHubApiService.getPal as jest.Mock).mockResolvedValue({
      id: 'pal-1',
      is_owned: true,
    });
    const {palsHubService} = require('../PalsHubService');

    await expect(palsHubService.checkPalOwnership('pal-1')).resolves.toEqual({
      owned: true,
      purchase_date: undefined,
    });

    (palsHubApiService.getPal as jest.Mock).mockResolvedValue({
      id: 'pal-1',
      is_owned: false,
    });
    await expect(palsHubService.checkPalOwnership('pal-1')).resolves.toEqual({
      owned: false,
      purchase_date: undefined,
    });
  });

  it('checkPalOwnership wraps unknown errors into PalsHubError', async () => {
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: true, user: {id: 'u1'}},
    }));
    const {palsHubApiService} = require('../PalsHubApiService');
    (palsHubApiService.getPal as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );
    const {palsHubService, PalsHubError} = require('../PalsHubService');

    await expect(palsHubService.checkPalOwnership('pal-1')).rejects.toThrow(
      PalsHubError,
    );
    await expect(palsHubService.checkPalOwnership('pal-1')).rejects.toThrow(
      'Failed to check ownership: boom',
    );
  });
});
