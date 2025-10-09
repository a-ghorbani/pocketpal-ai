// Tests for SyncService focusing on needsSync and syncUserLibrary writes

describe('SyncService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('needsSync respects auth and lastSyncTime thresholds', async () => {
    // Unauthenticated case
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: false},
    }));
    const {syncService} = require('../SyncService');
    await expect(syncService.needsSync()).resolves.toBe(false);

    // Authenticated and fresh sync
    jest.resetModules();
    jest.doMock('../AuthService', () => ({
      authService: {isAuthenticated: true},
    }));
    const {syncService: svc2} = require('../SyncService');
    svc2.lastSyncTime = Date.now();
    await expect(svc2.needsSync()).resolves.toBe(false);

    // Authenticated and stale sync (>5 min)
    const sixMin = 6 * 60 * 1000;
    svc2.lastSyncTime = Date.now() - sixMin;
    await expect(svc2.needsSync()).resolves.toBe(true);
  });

  it('syncUserLibrary writes entries and updates sync status', async () => {
    // Fresh module graph with explicit dependency mocks
    jest.resetModules();

    // Auth: signed in user
    jest.doMock('../AuthService', () => ({
      authService: {
        isAuthenticated: true,
        user: {id: 'u1'},
        session: {access_token: 't'},
      },
    }));

    // palsHubService.getLibrary returns two pals
    jest.doMock('../PalsHubService', () => ({
      palsHubService: {
        getLibrary: jest.fn().mockResolvedValue({
          pals: [{id: 'p1'}, {id: 'p2'}],
          total_count: 2,
          page: 1,
          limit: 20,
          has_more: false,
        }),
      },
    }));

    // Retry is pass-through; error handler simplified
    jest.doMock('../ErrorHandler', () => ({
      PalsHubErrorHandler: {
        handle: (e: any) => ({
          type: 'unknown',
          message: String(e?.message || e),
          userMessage: 'err',
          retryable: false,
        }),
      },
      RetryHandler: {withRetry: (op: any) => op()},
    }));

    // Intercept database writes at module-level via a full module mock
    const created: any[] = [];
    jest.doMock('../../../database', () => ({
      database: {
        get: (tableName: string) => {
          if (tableName === 'user_library') {
            return {
              query: () => ({fetch: async () => []}),
              create: async (cb: any) => {
                const r: any = {};
                cb(r);
                created.push(r);
                return r;
              },
            } as any;
          }
          if (tableName === 'sync_status') {
            return {
              query: () => ({fetch: async () => []}),
              create: async (cb: any) => {
                const r: any = {};
                cb(r);
                return r;
              },
              update: async () => {},
            } as any;
          }
          return {
            query: () => ({fetch: async () => []}),
            create: async () => ({}),
          } as any;
        },
        write: async (cb: any) => cb(),
      },
    }));

    const {syncService} = require('../SyncService');
    await syncService.syncUserLibrary();

    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      userId: 'u1',
      palshubId: 'p1',
      isDownloaded: false,
    });
    expect(created[1]).toMatchObject({
      userId: 'u1',
      palshubId: 'p2',
      isDownloaded: false,
    });
  });
});
