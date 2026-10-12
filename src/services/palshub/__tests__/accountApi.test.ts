import {Platform} from 'react-native';

import {
  DELETE_TIMEOUT_MS,
  mapDeleteResponse,
  postAccountDelete,
} from '../accountApi';
import {setApiBaseOverride} from '../apiBase';
import {
  ACCOUNT_DELETE_ROUTE,
  deleteResponse,
  statusOnly,
  verbatim,
} from '../../../../jest/fixtures/accountDeletion';
import {abortableFetch} from '../../../../jest/abortableFetch';

const fetchMock = jest.fn();
const sentInit = (call = 0) => fetchMock.mock.calls[call][1];

const respond = (status: number, rawBody: string | null) => {
  fetchMock.mockResolvedValue(deleteResponse(status, rawBody));
  return postAccountDelete({}, 'Bearer token-1');
};

describe('accountApi', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    setApiBaseOverride(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('request', () => {
    it('posts to the delete route with the client headers and the bearer', async () => {
      await respond(200, verbatim.deleted);

      expect(fetchMock.mock.calls[0][0]).toBe(
        `https://palshub.ai${ACCOUNT_DELETE_ROUTE}`,
      );
      expect(sentInit().method).toBe('POST');
      expect(sentInit().headers).toEqual({
        'Content-Type': 'application/json',
        'X-IAP-Capable': '1',
        'X-Client-Platform': Platform.OS,
        Authorization: 'Bearer token-1',
      });
      expect(sentInit().body).toBe('{}');
    });

    it('sends the Apple authorization code when given one', async () => {
      fetchMock.mockResolvedValue(deleteResponse(200, verbatim.deleted));

      await postAccountDelete({apple_authorization_code: 'c1'}, 'Bearer t');

      expect(sentInit().body).toBe('{"apple_authorization_code":"c1"}');
    });

    it('follows the API base override', async () => {
      setApiBaseOverride('http://127.0.0.1:8787');

      await respond(200, verbatim.deleted);

      expect(fetchMock.mock.calls[0][0]).toBe(
        `http://127.0.0.1:8787${ACCOUNT_DELETE_ROUTE}`,
      );
    });
  });

  describe('responses', () => {
    it('maps 200 to deleted', async () => {
      expect(await respond(200, verbatim.deleted)).toEqual({kind: 'deleted'});
    });

    it('maps a 200 with a non-JSON body to deleted', async () => {
      expect(await respond(200, null)).toEqual({kind: 'deleted'});
    });

    it('maps 410 to deleted', async () => {
      expect(await respond(410, verbatim.alreadyDeleted)).toEqual({
        kind: 'deleted',
      });
    });

    it('maps 401 to sign in again', async () => {
      expect(await respond(401, verbatim.unauthenticated)).toEqual({
        kind: 'sign_in_again',
      });
    });

    it('maps the creator 409 to the contact from the body', async () => {
      expect(await respond(409, verbatim.creatorContactSupport)).toEqual({
        kind: 'creator',
        contact: 'info@palshub.ai',
      });
    });

    it('maps the payment-in-progress 409 to failed', async () => {
      expect(await respond(409, verbatim.paymentInProgress)).toEqual({
        kind: 'failed',
      });
    });

    it.each([
      ['missing', '{"error":"creator_contact_support"}'],
      ['empty', '{"error":"creator_contact_support","contact":""}'],
      ['non-string', '{"error":"creator_contact_support","contact":42}'],
    ])('maps a creator 409 with a %s contact to failed', async (_, body) => {
      expect(await respond(409, body)).toEqual({kind: 'failed'});
    });

    it('maps a 409 with another error or no body to failed', async () => {
      expect(
        await respond(409, '{"error":"conflict","contact":"x@example.test"}'),
      ).toEqual({kind: 'failed'});
      expect(await respond(409, null)).toEqual({kind: 'failed'});
    });

    it.each([
      statusOnly.invalidRequest,
      statusOnly.rateLimited,
      statusOnly.internalError,
      403,
    ])('maps %i to failed', async status => {
      expect(await respond(status, null)).toEqual({kind: 'failed'});
    });

    it('reads the body only for a 409', () => {
      expect(
        mapDeleteResponse(500, {
          error: 'creator_contact_support',
          contact: 'x@example.test',
        }),
      ).toEqual({kind: 'failed'});
    });

    it('maps a network failure to failed without throwing', async () => {
      fetchMock.mockRejectedValue(new TypeError('Network request failed'));

      await expect(postAccountDelete({}, 'Bearer t')).resolves.toEqual({
        kind: 'failed',
      });
    });

    it('aborts after the timeout and maps it to failed', async () => {
      jest.useFakeTimers();
      const pending = abortableFetch();
      (global as any).fetch = pending;

      const attempt = postAccountDelete({}, 'Bearer t');
      jest.advanceTimersByTime(DELETE_TIMEOUT_MS - 1);
      expect(pending.mock.calls[0][1]?.signal?.aborted).toBe(false);
      jest.advanceTimersByTime(1);

      expect(DELETE_TIMEOUT_MS).toBe(15000);
      await expect(attempt).resolves.toEqual({kind: 'failed'});
    });

    it('logs neither the bearer nor the response body', async () => {
      await respond(409, verbatim.creatorContactSupport);
      fetchMock.mockRejectedValue(new TypeError('Network request failed'));
      await postAccountDelete({apple_authorization_code: 'c1'}, 'Bearer t');

      const logged = JSON.stringify((console.warn as jest.Mock).mock.calls);
      expect(logged).not.toContain('token-1');
      expect(logged).not.toContain('c1');
      expect(logged).not.toContain('info@palshub.ai');
    });
  });
});
