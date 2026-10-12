import {Platform} from 'react-native';

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
    resetLocalSession: jest.fn(() => {
      calls.push('resetLocalSession');
    }),
  },
  {
    error: observedField('error', null),
    isLoading: observedField('isLoading', false),
  },
);
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
const cleanupCalls = () =>
  calls.filter(call => !['fetch', 'apple', 'confirm'].includes(call));
const confirmWith = (answer: () => Promise<boolean>) =>
  jest.fn(() => {
    calls.push('confirm');
    return answer();
  });

describe('deleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    writes.length = 0;
    setOS('android');
    (global as any).fetch = fetchMock;
    fetchMock.mockReset();
    mockAuth.hasAppleIdentity.mockReturnValue(false);
    mockAuth.appleSubject.mockReturnValue(null);
    mockAuth.signOut.mockImplementation(async (options: unknown) => {
      calls.push(`signOut:${JSON.stringify(options)}`);
      return true;
    });
    clearAccountPals.mockImplementation(() => {
      calls.push('clearAccountPals');
    });
    mockSync.clearCache.mockImplementation(async () => {
      calls.push('clearCache');
    });
    mockGetAuthHeaders.mockResolvedValue({Authorization: 'Bearer old-token'});
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

  describe('when Apple is unavailable', () => {
    beforeEach(() => {
      appleUser({reauth: {kind: 'unavailable'}});
    });

    it('asks once more and deletes without a code on confirm', async () => {
      const confirmWithoutApple = confirmWith(async () => true);
      respondWith([200, verbatim.deleted]);

      await expect(deleteAccount({confirmWithoutApple})).resolves.toEqual({
        kind: 'deleted',
      });

      expect(sentBody()).toBe('{}');
      expect(confirmWithoutApple).toHaveBeenCalledTimes(1);
      expect(calls.slice(0, 3)).toEqual(['apple', 'confirm', 'fetch']);
    });

    it.each([
      ['declines', confirmWith(async () => false)],
      ['rejects', confirmWith(async () => Promise.reject(new Error('x')))],
      ['is missing', undefined],
    ])('sends nothing when the prompt %s', async (_, confirmWithoutApple) => {
      await expect(deleteAccount({confirmWithoutApple})).resolves.toEqual({
        kind: 'cancelled',
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockGetAuthHeaders).not.toHaveBeenCalled();
      expect(cleanupCalls()).toEqual([]);
    });
  });

  it.each([
    ['the matching user', {kind: 'code', code: 'c1', appleUser: 'S'}],
    ['a different user', {kind: 'code', code: 'c2', appleUser: 'T'}],
  ])('never asks again when Apple returns a code for %s', async (_, reauth) => {
    appleUser({reauth});
    const confirmWithoutApple = confirmWith(async () => false);
    respondWith([200, verbatim.deleted]);

    await expect(deleteAccount({confirmWithoutApple})).resolves.toEqual({
      kind: 'deleted',
    });

    expect(confirmWithoutApple).not.toHaveBeenCalled();
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
    const confirmWithoutApple = confirmWith(async () => false);
    respondWith([200, verbatim.deleted]);

    await expect(deleteAccount({confirmWithoutApple})).resolves.toEqual({
      kind: 'deleted',
    });

    expect(mockAuth.reauthorizeWithApple).not.toHaveBeenCalled();
    expect(confirmWithoutApple).not.toHaveBeenCalled();
    expect(sentBody()).toBe('{}');
  });

  it('treats 410 as deleted and clears local account data', async () => {
    respondWith([410, verbatim.alreadyDeleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(cleanupCalls()).toEqual(fullCleanup);
  });

  describe('asks to sign in again', () => {
    it('on a 401, with one request and no clean-up', async () => {
      respondWith([401, verbatim.unauthenticated]);

      await expect(deleteAccount()).resolves.toEqual({kind: 'sign_in_again'});

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cleanupCalls()).toEqual([]);
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

  it('fails a payment still in progress and deletes nothing locally', async () => {
    respondWith([409, verbatim.paymentInProgress]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'failed'});

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

  it.each([
    ['signOut', () => mockAuth.signOut.mockRejectedValue(new Error('x')), 1, 1],
    [
      'clearCache',
      () => mockSync.clearCache.mockRejectedValue(new Error('x')),
      1,
      0,
    ],
  ])(
    'stays deleted and finishes clean-up when %s rejects',
    async (_, fail, signOuts, resets) => {
      fail();
      respondWith([200, verbatim.deleted]);

      await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

      expect(mockAuth.signOut).toHaveBeenCalledTimes(signOuts);
      expect(mockAuth.resetLocalSession).toHaveBeenCalledTimes(resets);
      expect(clearAccountPals).toHaveBeenCalledTimes(1);
      expect(mockSync.clearCache).toHaveBeenCalledTimes(1);
    },
  );

  it('resets the local session when the local sign-out fails, then finishes clean-up', async () => {
    mockAuth.signOut.mockImplementationOnce(async () => {
      calls.push('signOut');
      return false;
    });
    respondWith([200, verbatim.deleted]);

    await expect(deleteAccount()).resolves.toEqual({kind: 'deleted'});

    expect(cleanupCalls()).toEqual([
      'signOut',
      'resetLocalSession',
      'clearAccountPals',
      'clearCache',
    ]);
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
    expect(logged).not.toContain('info@palshub.ai');
  });
});
