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

  describe('createCheckoutSession', () => {
    const session = {
      checkout_url: 'https://stripe.test/c/123',
      session_url: 'https://stripe.test/c/123',
      session_id: 'cs_123',
      purchase_id: 'pur_123',
      platform_fee_cents: 50,
    };

    const loadService = () => {
      jest.doMock('@env', () => ({PALSHUB_API_BASE_URL: 'https://api.test'}));
      jest.doMock('../supabase', () => ({
        getAuthHeaders: jest
          .fn()
          .mockResolvedValue({Authorization: 'Bearer token-abc'}),
      }));
      return require('../PalsHubApiService');
    };

    it('posts to /api/mobile/purchases with the Bearer header and return URLs', async () => {
      const {palsHubApiService} = loadService();
      // @ts-ignore
      global.fetch = jest
        .fn()
        .mockResolvedValue({ok: true, json: async () => session});

      const result = await palsHubApiService.createCheckoutSession('pal-1', {
        successUrl: 'https://host.test/app-return/success',
        cancelUrl: 'https://host.test/app-return/cancel',
      });

      expect(result).toEqual(session);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.test/api/mobile/purchases');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer token-abc');
      expect(JSON.parse(options.body)).toEqual({
        pal_id: 'pal-1',
        success_url: 'https://host.test/app-return/success',
        cancel_url: 'https://host.test/app-return/cancel',
      });
    });

    it('includes selected_country_code only for alpha-2 codes', async () => {
      const {palsHubApiService} = loadService();
      // @ts-ignore
      global.fetch = jest
        .fn()
        .mockResolvedValue({ok: true, json: async () => session});

      await palsHubApiService.createCheckoutSession('pal-1', {
        successUrl: 'https://host.test/app-return/success',
        cancelUrl: 'https://host.test/app-return/cancel',
        selectedCountryCode: 'US',
      });

      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(body.selected_country_code).toBe('US');
    });

    it('omits selected_country_code for alpha-3 ("USA") and undefined', async () => {
      const {palsHubApiService} = loadService();
      // @ts-ignore
      global.fetch = jest
        .fn()
        .mockResolvedValue({ok: true, json: async () => session});

      await palsHubApiService.createCheckoutSession('pal-1', {
        successUrl: 'https://host.test/app-return/success',
        cancelUrl: 'https://host.test/app-return/cancel',
        selectedCountryCode: 'USA',
      });
      await palsHubApiService.createCheckoutSession('pal-1', {
        successUrl: 'https://host.test/app-return/success',
        cancelUrl: 'https://host.test/app-return/cancel',
      });

      const body1 = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      const body2 = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body,
      );
      expect(body1.selected_country_code).toBeUndefined();
      expect(body2.selected_country_code).toBeUndefined();
    });

    it.each([
      [400, 'already_owned'],
      [401, 401],
      [404, 404],
      [500, 500],
    ])('maps HTTP %s to checkout error status %s', async (http, expected) => {
      const {palsHubApiService, PalsHubError} = loadService();
      // @ts-ignore
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: http,
        statusText: 'err',
        json: async () => ({error: 'nope'}),
      });

      const err = await palsHubApiService
        .createCheckoutSession('pal-1', {
          successUrl: 'https://host.test/app-return/success',
          cancelUrl: 'https://host.test/app-return/cancel',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PalsHubError);
      expect((err as {details: {status: unknown}}).details.status).toBe(
        expected,
      );
    });

    it('maps a fetch throw to network', async () => {
      const {palsHubApiService} = loadService();
      // @ts-ignore
      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

      await expect(
        palsHubApiService.createCheckoutSession('pal-1', {
          successUrl: 'https://host.test/app-return/success',
          cancelUrl: 'https://host.test/app-return/cancel',
        }),
      ).rejects.toMatchObject({details: {status: 'network'}});
    });
  });

  describe('transformApiPal', () => {
    let service: any;

    beforeEach(() => {
      jest.resetModules();
      jest.doMock('@env', () => ({
        PALSHUB_API_BASE_URL: 'https://api.test.com',
      }));
      jest.doMock('../AuthService', () => ({
        authService: {user: null, session: null},
      }));
      jest.doMock('../supabase', () => ({
        getAuthHeaders: jest.fn().mockResolvedValue({}),
      }));
      const {palsHubApiService} = require('../PalsHubApiService');
      service = palsHubApiService;
    });

    it('should transform a complete API pal response', () => {
      const apiPal = {
        id: 'pal-123',
        title: 'Test Pal',
        description: 'Test description',
        thumbnail_url: 'https://example.com/thumb.jpg',
        price_cents: 999,
        is_free: false,
        creator: {
          id: 'creator-456',
          display_name: 'Test Creator',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        categories: [{id: 'cat-1', name: 'Productivity', icon: 'briefcase'}],
        tags: [{id: 'tag-1', name: 'writing'}],
        stats: {rating: 4.5, review_count: 42},
        is_owned: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        system_prompt: 'You are helpful',
        model_reference: {
          repo_id: 'test/model',
          filename: 'model.gguf',
          author: 'test',
          downloadUrl: 'https://example.com/model.gguf',
          size: 1024000,
        },
        model_settings: {temperature: 0.7},
        protection_level: 'reveal_on_purchase' as const,
      };

      const result = service.transformApiPal(apiPal);

      expect(result.type).toBe('palshub');
      expect(result.id).toBe('pal-123');
      expect(result.creator_id).toBe('creator-456');
      expect(result.title).toBe('Test Pal');
      expect(result.protection_level).toBe('reveal_on_purchase');
      expect(result.allow_fork).toBe(true);
      expect(result.average_rating).toBe(4.5);
      expect(result.review_count).toBe(42);
    });

    it('should handle missing optional fields with defaults', () => {
      const apiPal = {
        id: 'pal-minimal',
        title: 'Minimal Pal',
        price_cents: 0,
        is_free: true,
        categories: [],
        tags: [],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
      };

      const result = service.transformApiPal(apiPal);

      expect(result.model_settings).toEqual({});
      expect(result.protection_level).toBe('public');
      expect(result.updated_at).toBe('2024-01-01T00:00:00Z');
      expect(result.allow_fork).toBe(true);
      expect(result.average_rating).toBeUndefined();
    });

    it('should handle missing creator with empty defaults', () => {
      const apiPal = {
        id: 'pal-no-creator',
        title: 'No Creator',
        price_cents: 0,
        is_free: true,
        categories: [],
        tags: [],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
      };

      const result = service.transformApiPal(apiPal);

      expect(result.creator_id).toBe('');
      expect(result.creator.id).toBe('');
      expect(result.creator.display_name).toBe('');
      expect(result.creator.provider).toBe('unknown');
    });

    it('should transform multiple categories and tags', () => {
      const apiPal = {
        id: 'pal-multi',
        title: 'Multi Pal',
        price_cents: 0,
        is_free: true,
        categories: [
          {id: 'cat-1', name: 'Productivity', icon: 'briefcase'},
          {id: 'cat-2', name: 'Creative'},
        ],
        tags: [
          {id: 'tag-1', name: 'writing'},
          {id: 'tag-2', name: 'coding'},
        ],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
      };

      const result = service.transformApiPal(apiPal);

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].name).toBe('Productivity');
      expect(result.categories[1].icon).toBeUndefined();
      expect(result.tags).toHaveLength(2);
      expect(result.tags[0].name).toBe('writing');
      expect(result.tags[1].name).toBe('coding');
    });

    it('should handle null rating correctly', () => {
      const apiPal = {
        id: 'pal-no-rating',
        title: 'No Rating',
        price_cents: 0,
        is_free: true,
        categories: [],
        tags: [],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
      };

      const result = service.transformApiPal(apiPal);

      expect(result.average_rating).toBeUndefined();
      expect(result.review_count).toBe(0);
    });

    it('should handle different protection levels', () => {
      const levels: Array<'public' | 'reveal_on_purchase' | 'private'> = [
        'public',
        'reveal_on_purchase',
        'private',
      ];

      levels.forEach(level => {
        const apiPal = {
          id: `pal-${level}`,
          title: 'Test',
          price_cents: 0,
          is_free: true,
          categories: [],
          tags: [],
          stats: {rating: null, review_count: 0},
          is_owned: false,
          created_at: '2024-01-01T00:00:00Z',
          protection_level: level,
        };

        const result = service.transformApiPal(apiPal);
        expect(result.protection_level).toBe(level);
      });
    });

    it('should preserve complex model_settings', () => {
      const apiPal = {
        id: 'pal-settings',
        title: 'Settings Pal',
        price_cents: 0,
        is_free: true,
        categories: [],
        tags: [],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
        model_settings: {
          temperature: 0.8,
          top_p: 0.95,
          custom: 'value',
          nested: {param: 'test'},
        },
      };

      const result = service.transformApiPal(apiPal);

      expect(result.model_settings).toEqual({
        temperature: 0.8,
        top_p: 0.95,
        custom: 'value',
        nested: {param: 'test'},
      });
    });

    it('forwards pact, greeting, images, models when present', () => {
      const apiPal = {
        id: 'pal-new-fields',
        title: 'Has new fields',
        price_cents: 0,
        is_free: true,
        categories: [],
        tags: [],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
        pact: {
          version: 1,
          talents: [
            {name: 'render_html', required: true},
            {name: 'calculate', required: false},
          ],
        },
        greeting: {
          text: 'Hello there',
          suggested_prompts: ['Draw a sunset', 'Make a chart'],
        },
        images: [{url: 'https://example.com/a.png', is_primary: true}],
        models: [{repo_id: 'foo/bar', is_recommended: true}],
      };

      const result = service.transformApiPal(apiPal);

      // Wire-boundary forwarding is verbatim — snake_case preserved, no
      // shape conversion. The snake_case to camelCase rename and the
      // strict-boolean to necessity mapping happen at the next boundary
      // (PalStore.createLocalPalFromPalsHub).
      expect(result.pact).toEqual({
        version: 1,
        talents: [
          {name: 'render_html', required: true},
          {name: 'calculate', required: false},
        ],
      });
      expect(result.greeting).toEqual({
        text: 'Hello there',
        suggested_prompts: ['Draw a sunset', 'Make a chart'],
      });
      expect(result.images).toEqual([
        {url: 'https://example.com/a.png', is_primary: true},
      ]);
      expect(result.models).toEqual([
        {repo_id: 'foo/bar', is_recommended: true},
      ]);
    });

    it('leaves new fields undefined when absent', () => {
      const apiPal = {
        id: 'pal-no-new-fields',
        title: 'No new fields',
        price_cents: 0,
        is_free: true,
        categories: [],
        tags: [],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
      };

      const result = service.transformApiPal(apiPal);

      expect(result.pact).toBeUndefined();
      expect(result.greeting).toBeUndefined();
      expect(result.images).toBeUndefined();
      expect(result.models).toBeUndefined();
    });

    it('forwards pact with version field intact (drop happens at next boundary)', () => {
      const apiPal = {
        id: 'pal-pact-version',
        title: 'Pact with version',
        price_cents: 0,
        is_free: true,
        categories: [],
        tags: [],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
        pact: {
          version: 1,
          talents: [{name: 'calculate', required: true}],
        },
      };

      const result = service.transformApiPal(apiPal);

      // Wire boundary preserves `version`; the conversion site drops it.
      expect(result.pact).toEqual({
        version: 1,
        talents: [{name: 'calculate', required: true}],
      });
      expect(result.pact?.version).toBe(1);
    });

    it('forwards explicit null pact/greeting verbatim (server-side null vs absent)', () => {
      const apiPal = {
        id: 'pal-null-fields',
        title: 'Explicit null fields',
        price_cents: 0,
        is_free: true,
        categories: [],
        tags: [],
        stats: {rating: null, review_count: 0},
        is_owned: false,
        created_at: '2024-01-01T00:00:00Z',
        pact: null,
        greeting: null,
      };

      const result = service.transformApiPal(apiPal);

      // Forwarder is verbatim; the conversion site collapses null → undefined.
      expect(result.pact).toBeNull();
      expect(result.greeting).toBeNull();
    });
  });
});
