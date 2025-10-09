// Tests for PalsHubApiService

describe('PalsHubApiService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // @ts-ignore
    global.fetch = undefined;
  });

  it('throws when PALSHUB_API_BASE_URL is not configured', async () => {
    jest.doMock('@env', () => ({PALSHUB_API_BASE_URL: undefined}));
    jest.doMock('../supabase', () => ({
      getAuthHeaders: jest.fn().mockResolvedValue({}),
    }));

    const {palsHubApiService, PalsHubError} = require('../PalsHubApiService');

    await expect(palsHubApiService.getPals()).rejects.toThrow(PalsHubError);
    await expect(palsHubApiService.getPals()).rejects.toThrow(
      'PalsHub API not configured',
    );
  });

  it('builds correct URL and maps response in getPals', async () => {
    jest.doMock('@env', () => ({PALSHUB_API_BASE_URL: 'https://api.test'}));
    jest.doMock('../supabase', () => ({
      getAuthHeaders: jest.fn().mockResolvedValue({}),
    }));

    // @ts-ignore
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pals: [],
        pagination: {page: 2, limit: 5, total: 0, has_more: false},
        filters_applied: {},
      }),
    });

    const {palsHubApiService} = require('../PalsHubApiService');

    const result = await palsHubApiService.getPals({
      query: 'foo',
      category_ids: ['cat1'],
      tag_names: ['tag1'],
      price_min: 1,
      price_max: 100,
      sort_by: 'rating',
      page: 2,
      limit: 5,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/api/mobile/pals?q=foo&category=cat1&tag=tag1&price_min=1&price_max=100&sort=popular&page=2&limit=5',
      expect.any(Object),
    );
    expect(result).toEqual({
      pals: [],
      total_count: 0,
      page: 2,
      limit: 5,
      has_more: false,
    });
  });

  it('enforces auth guards for getLibrary', async () => {
    jest.doMock('@env', () => ({PALSHUB_API_BASE_URL: 'https://api.test'}));
    jest.doMock('../supabase', () => ({
      getAuthHeaders: jest.fn().mockResolvedValue({}),
    }));

    // case: no user
    jest.doMock('../AuthService', () => ({
      authService: {user: null, session: {access_token: 't'}},
    }));
    const api1 = require('../PalsHubApiService');
    await expect(api1.palsHubApiService.getLibrary()).rejects.toThrow(
      'User not authenticated',
    );

    // fresh module for case: no session
    jest.resetModules();
    jest.doMock('@env', () => ({PALSHUB_API_BASE_URL: 'https://api.test'}));
    jest.doMock('../supabase', () => ({
      getAuthHeaders: jest.fn().mockResolvedValue({}),
    }));
    jest.doMock('../AuthService', () => ({
      authService: {user: {id: 'u1'}, session: null},
    }));
    const api2 = require('../PalsHubApiService');
    await expect(api2.palsHubApiService.getLibrary()).rejects.toThrow(
      'No valid session',
    );
  });
});
