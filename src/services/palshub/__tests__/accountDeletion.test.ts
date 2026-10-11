import {Platform} from 'react-native';
import {AuthRetryableFetchError} from '@supabase/supabase-js';

import {deleteAccount} from '../accountDeletion';
import {palStore} from '../../../store';
import {
  deleteResponse,
  statusOnly,
  verbatim,
} from '../../../../jest/fixtures/accountDeletion';
import {abortableFetch} from '../../../../jest/abortableFetch';

jest.unmock('../accountDeletion');

jest.mock('../AuthService', () => ({
  get authService() {
    return mockAuth;
  },
}));
jest.mock('../supabase', () => ({
  get supabase() {
    return mockSupabaseConfigured ? mockSupabase : null;
  },
  get getAuthHeaders() {
    return mockGetAuthHeaders;
  },
}));
jest.mock('../SyncService', () => ({
  get syncService() {
    return mockSync;
  },
}));

const calls: string[] = [];
const writes: string[] = [];

const observedField = (name: string, initial: unknown) => {
  let value = initial;
  return {
    get: () => value,
    set: (next: unknown) => {
      writes.push(name);
      value = next;
    },
  };
};

const mockAuth: Record<string, any> = Object.defineProperties(
  {
    hasAppleIdentity: jest.fn(),
    appleSubject: jest.fn(),
    reauthorizeWithApple: jest.fn(),
    signOut: jest.fn(),
  },
  {
    error: observedField('error', null),
    isLoading: observedField('isLoading', false),
  },
);
let mockSupabaseConfigured = true;
const mockSupabase = {auth: {refreshSession: jest.fn()}};
const mockGetAuthHeaders = jest.fn();
const mockSync = {clearCache: jest.fn()};
const fetchMock = jest.fn();
const clearAccountPals = palStore.clearAccountPals as jest.Mock;

const originalOS = Platform.OS;
const setOS = (os: 'ios' | 'android') => {
  (Platform as any).OS = os;
};

const respondWith = (...responses: Array<[number, string | null]>) => {
  responses.forEach(([status, body]) =>
    fetchMock.mockImplementationOnce(async () => {
      calls.push('fetch');
      return deleteResponse(status, body);
    }),
  );
};

const appleUser = ({
  subject = 'S' as string | null,
  reauth = {kind: 'code', code: 'c1', appleUser: 'S'} as any,
} = {}) => {
  setOS('ios');
  mockAuth.hasAppleIdentity.mockReturnValue(true);
  mockAuth.appleSubject.mockReturnValue(subject);
  mockAuth.reauthorizeWithApple.mockImplementation(async () => {
    calls.push('apple');
    return reauth;
  });
};

const sentBody = (call = 0) => fetchMock.mock.calls[call][1].body;
const sentBearer = (call = 0) =>
  fetchMock.mock.calls[call][1].headers.Authorization;
const cleanupCalls = () =>
  calls.filter(call => !['fetch', 'apple'].includes(call));

describe('deleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    writes.length = 0;
    mockSupabaseConfigured = true;
    setOS('android');
    (global as any).fetch = fetchMock;
    fetchMock.mockReset();
    mockAuth.hasAppleIdentity.mockReturnValue(false);
    mockAuth.appleSubject.mockReturnValue(null);
    mockAuth.signOut.mockImplementation(async (options: unknown) => {
      calls.push(`signOut:${JSON.stringify(options)}`);
    });
    clearAccountPals.mockImplementation(() => {
      calls.push('clearAccountPals');
    });
    mockSync.clearCache.mockImplementation(async () => {
      calls.push('clearCache');
    });
    mockGetAuthHeaders.mockResolvedValue({Authorization: 'Bearer old-token'});
    mockSupabase.auth.refreshSession.mockResolvedValue({
      data: {session: {access_token: 'new-token'}},
      error: null,
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  afterAll(() => {
    setOS(originalOS as 'ios' | 'android');
  });

  const fullCleanup = [
    'signOut:{"scope":"local"}',
    'clearAccountPals',
    'clearCache',
  ];

  it.each(['android', 'ios'] as const)(
    'deletes an email account on %s and clears local account data in order',
    async os => {
      setOS(os);
      respondWith([200, verbatim.deleted]);

      await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

      expect(sentBody()).toBe('{}');
      expect(mockAuth.reauthorizeWithApple).not.toHaveBeenCalled();
      expect(calls).toEqual(['fetch', ...fullCleanup]);
    },
  );

  it('sends the Apple code of the matching Apple user, prompting once before the request', async () => {
    appleUser();
    respondWith([200, verbatim.deleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(sentBody()).toBe('{"apple_authorization_code":"c1"}');
    expect(mockAuth.reauthorizeWithApple).toHaveBeenCalledTimes(1);
    expect(calls.slice(0, 2)).toEqual(['apple', 'fetch']);
  });

  it('sends no request when the Apple sheet is cancelled', async () => {
    appleUser({reauth: {kind: 'cancelled'}});

    await expect(deleteAccount()).resolves.toEqual({kind: 'cancelled'});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(cleanupCalls()).toEqual([]);
  });

  it('deletes without a code when Apple is unavailable', async () => {
    appleUser({reauth: {kind: 'unavailable'}});
    respondWith([200, verbatim.deleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(sentBody()).toBe('{}');
  });

  it('drops a code from a different Apple user', async () => {
    appleUser({reauth: {kind: 'code', code: 'c2', appleUser: 'T'}});
    respondWith([200, verbatim.deleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(sentBody()).toBe('{}');
    expect(sentBody()).not.toContain('c2');
  });

  it('sends the code when only app_metadata names Apple', async () => {
    appleUser({
      subject: null,
      reauth: {kind: 'code', code: 'c3', appleUser: 'U'},
    });
    respondWith([200, verbatim.deleted]);

    await deleteAccount();

    expect(sentBody()).toBe('{"apple_authorization_code":"c3"}');
  });

  it('never prompts Apple on Android, even for an Apple identity', async () => {
    mockAuth.hasAppleIdentity.mockReturnValue(true);
    respondWith([200, verbatim.deleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(mockAuth.reauthorizeWithApple).not.toHaveBeenCalled();
    expect(sentBody()).toBe('{}');
  });

  it('treats 410 as deleted and clears local account data', async () => {
    respondWith([410, verbatim.alreadyDeleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(cleanupCalls()).toEqual(fullCleanup);
  });

  it('refreshes once after a 401 and retries with the same body and a fresh bearer', async () => {
    appleUser();
    respondWith([401, verbatim.unauthenticated], [200, verbatim.deleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(1)).toBe(sentBody(0));
    expect(sentBearer(0)).toBe('Bearer old-token');
    expect(sentBearer(1)).toBe('Bearer new-token');
    expect(mockSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockAuth.reauthorizeWithApple).toHaveBeenCalledTimes(1);
  });

  it('fails when the refresh after a 401 cannot reach the server', async () => {
    respondWith([401, verbatim.unauthenticated]);
    mockSupabase.auth.refreshSession.mockResolvedValue({
      data: {session: null},
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });

    await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cleanupCalls()).toEqual([]);
  });

  describe('asks to sign in again', () => {
    it('after a second 401', async () => {
      respondWith(
        [401, verbatim.unauthenticated],
        [401, verbatim.unauthenticated],
      );

      await expect(deleteAccount()).resolves.toEqual({kind: 'sign_in_again'});

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(cleanupCalls()).toEqual([]);
    });

    it('when the refresh fails', async () => {
      respondWith([401, verbatim.unauthenticated]);
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: {session: null},
        error: {message: 'Invalid Refresh Token'},
      });

      await expect(deleteAccount()).resolves.toEqual({kind: 'sign_in_again'});

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cleanupCalls()).toEqual([]);
    });

    it('when the refresh returns no session', async () => {
      respondWith([401, verbatim.unauthenticated]);
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: {session: null},
        error: null,
      });

      await expect(deleteAccount()).resolves.toEqual({kind: 'sign_in_again'});

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('without an access token, sending nothing', async () => {
      mockGetAuthHeaders.mockResolvedValue({});

      await expect(deleteAccount()).resolves.toEqual({kind: 'sign_in_again'});

      expect(fetchMock).not.toHaveBeenCalled();
      expect(cleanupCalls()).toEqual([]);
    });
  });

  it('returns the server contact for a creator account and deletes nothing locally', async () => {
    respondWith([409, verbatim.creatorContactSupport]);

    await expect(deleteAccount()).resolves.toEqual({
      kind: 'creator',
      contact: 'info@palshub.ai',
    });

    expect(cleanupCalls()).toEqual([]);
  });

  it('reports a payment still in progress and deletes nothing locally', async () => {
    respondWith([409, verbatim.paymentInProgress]);

    await expect(deleteAccount()).resolves.toEqual({
      kind: 'payment_in_progress',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cleanupCalls()).toEqual([]);
  });

  it('fails a creator 409 without a contact', async () => {
    respondWith([409, '{"error":"creator_contact_support"}']);

    await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});
  });

  it.each([
    statusOnly.invalidRequest,
    statusOnly.rateLimited,
    statusOnly.internalError,
    403,
  ])('fails on %i with one request and no clean-up', async status => {
    respondWith([status, null]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cleanupCalls()).toEqual([]);
  });

  it('fails on a network error with no clean-up', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});

    expect(cleanupCalls()).toEqual([]);
  });

  it('fails on a timeout with no clean-up', async () => {
    jest.useFakeTimers();
    const pending = abortableFetch();
    (global as any).fetch = pending;

    const outcome = deleteAccount();
    await jest.advanceTimersByTimeAsync(15000);

    await expect(outcome).resolves.toEqual({kind: 'failed'});
    expect(pending).toHaveBeenCalledTimes(1);
    expect(cleanupCalls()).toEqual([]);
  });

  it('shares one request between concurrent calls', async () => {
    respondWith([200, verbatim.deleted]);

    const first = deleteAccount();
    const second = deleteAccount();

    expect(second).toBe(first);
    await expect(first).resolves.toEqual({kind: 'deleted'});
    await expect(second).resolves.toEqual({kind: 'deleted'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('starts a new request once the previous one has settled', async () => {
    respondWith([500, null], [200, verbatim.deleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});
    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['signOut', () => mockAuth.signOut.mockRejectedValue(new Error('x'))],
    ['clearCache', () => mockSync.clearCache.mockRejectedValue(new Error('x'))],
  ])('stays deleted and finishes clean-up when %s rejects', async (_, fail) => {
    fail();
    respondWith([200, verbatim.deleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(clearAccountPals).toHaveBeenCalledTimes(1);
    expect(mockSync.clearCache).toHaveBeenCalledTimes(1);
  });

  it('fails without a request when Supabase is not configured', async () => {
    mockSupabaseConfigured = false;

    await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('never throws', () => {
    it('when the Apple step rejects', async () => {
      appleUser();
      mockAuth.reauthorizeWithApple.mockRejectedValue(new Error('boom'));

      await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('when reading the auth headers rejects', async () => {
      mockGetAuthHeaders.mockRejectedValue(new Error('boom'));

      await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('never writes the auth error or loading state itself', async () => {
    appleUser();
    respondWith(
      [401, verbatim.unauthenticated],
      [200, verbatim.deleted],
      [409, verbatim.creatorContactSupport],
      [500, null],
    );

    await deleteAccount();
    await deleteAccount();
    await deleteAccount();
    mockAuth.reauthorizeWithApple.mockResolvedValue({kind: 'cancelled'});
    await deleteAccount();

    expect(writes).toEqual([]);
  });

  it('logs neither the Apple code, the bearer nor the server body', async () => {
    appleUser();
    respondWith(
      [401, verbatim.unauthenticated],
      [409, verbatim.creatorContactSupport],
    );
    await deleteAccount();
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await deleteAccount();

    const logged = JSON.stringify([
      (console.warn as jest.Mock).mock.calls,
      (console.log as jest.Mock).mock.calls,
      (console.error as jest.Mock).mock.calls,
    ]);
    expect(logged).not.toContain('c1');
    expect(logged).not.toContain('old-token');
    expect(logged).not.toContain('new-token');
    expect(logged).not.toContain('info@palshub.ai');
  });
});
