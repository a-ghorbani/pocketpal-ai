/**
 * CheckoutFlowStore — checkout state machine and reconcile poll.
 */

jest.mock('../../services/palshub/PalsHubApiService', () => ({
  palsHubApiService: {createCheckoutSession: jest.fn()},
}));
jest.mock('../../services', () => ({
  palsHubService: {checkPalOwnership: jest.fn()},
}));
jest.mock('../../utils/region', () => ({
  getStorefrontCountryCode: jest.fn().mockResolvedValue('US'),
}));

jest.mock('../../specs/NativeAuthSession', () => ({
  __esModule: true,
  default: {openAuth: jest.fn()},
}));

import {palsHubApiService} from '../../services/palshub/PalsHubApiService';
import {palsHubService} from '../../services';
import NativeAuthSession from '../../specs/NativeAuthSession';
import {checkoutFlowStore} from '../CheckoutFlowStore';

const createSession = palsHubApiService.createCheckoutSession as jest.Mock;
const checkPalOwnership = palsHubService.checkPalOwnership as jest.Mock;
const openAuth = (NativeAuthSession as unknown as {openAuth: jest.Mock})
  .openAuth;

const session = {
  checkout_url: 'https://stripe.test/c/1',
  session_url: 'https://stripe.test/c/1',
  session_id: 'cs_1',
  purchase_id: 'pur_1',
  platform_fee_cents: 50,
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('CheckoutFlowStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    checkoutFlowStore.reset();
    createSession.mockResolvedValue(session);
    checkPalOwnership.mockResolvedValue({owned: false});
    // Default: the session never resolves, so start() parks in browser_open
    // and tests that drive onReturn directly stay deterministic.
    openAuth.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts idle', () => {
    expect(checkoutFlowStore.status).toBe('idle');
  });

  it('200 -> browser_open and opens the auth session', async () => {
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(createSession).toHaveBeenCalledWith(
      'pal-1',
      expect.objectContaining({
        successUrl: expect.stringContaining('/app-return/success'),
        cancelUrl: expect.stringContaining('/app-return/cancel'),
        selectedCountryCode: 'US',
      }),
    );
    expect(openAuth).toHaveBeenCalledWith(session.checkout_url, 'pocketpal');
    expect(checkoutFlowStore.status).toBe('browser_open');
    expect(checkoutFlowStore.purchaseId).toBe('pur_1');
  });

  it('400 already owned -> owned without opening the auth session', async () => {
    createSession.mockRejectedValue({details: {status: 'already_owned'}});
    await checkoutFlowStore.start('pal-1');
    expect(openAuth).not.toHaveBeenCalled();
    expect(checkoutFlowStore.status).toBe('owned');
  });

  it.each([
    ['already_owned', 'owned'],
    [401, 'error'],
    [404, 'error'],
    [500, 'error'],
    ['network', 'error'],
  ])('create error %s -> status %s', async (status, expectedStatus) => {
    createSession.mockRejectedValue({details: {status}});
    await checkoutFlowStore.start('pal-1');
    expect(checkoutFlowStore.status).toBe(expectedStatus);
  });

  it('sets errorKind from the create error status', async () => {
    createSession.mockRejectedValue({details: {status: 401}});
    await checkoutFlowStore.start('pal-1');
    expect(checkoutFlowStore.errorKind).toBe('401');
  });

  it('a press while in flight is a no-op', async () => {
    createSession.mockReturnValue(new Promise(() => {})); // never resolves
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('creating');
    await checkoutFlowStore.start('pal-2');
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  describe('reconcile on success return', () => {
    beforeEach(async () => {
      checkoutFlowStore.start('pal-1'); // -> browser_open (session pending)
      await flushMicrotasks();
    });

    it('owned on attempt 1 -> owned', async () => {
      checkPalOwnership.mockResolvedValueOnce({owned: true});
      checkoutFlowStore.onReturn('pal-1', 'success');
      expect(checkoutFlowStore.status).toBe('finalizing');
      await jest.advanceTimersByTimeAsync(1000);
      expect(checkoutFlowStore.status).toBe('owned');
    });

    it('webhook lag: false/thrown x6 -> processing_deferred, never error', async () => {
      checkPalOwnership
        .mockResolvedValueOnce({owned: false})
        .mockRejectedValueOnce(new Error('flaky'))
        .mockResolvedValueOnce({owned: false})
        .mockRejectedValueOnce(new Error('flaky'))
        .mockResolvedValueOnce({owned: false})
        .mockRejectedValueOnce(new Error('flaky'));
      checkoutFlowStore.onReturn('pal-1', 'success');
      await jest.advanceTimersByTimeAsync(30000);
      expect(checkoutFlowStore.status).toBe('processing_deferred');
      expect(checkoutFlowStore.status).not.toBe('error');
    });

    it('reset mid-poll aborts and does not flip status', async () => {
      checkPalOwnership.mockResolvedValue({owned: false});
      checkoutFlowStore.onReturn('pal-1', 'success');
      await jest.advanceTimersByTimeAsync(1000);
      checkoutFlowStore.reset();
      await jest.advanceTimersByTimeAsync(30000);
      expect(checkoutFlowStore.status).toBe('idle');
    });
  });

  it('cancel return -> cancelled, silent', async () => {
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    checkoutFlowStore.onReturn('pal-1', 'cancel');
    expect(checkoutFlowStore.status).toBe('cancelled');
  });

  it('stale return for a different pal is ignored', async () => {
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    checkoutFlowStore.onReturn('pal-OTHER', 'success');
    expect(checkoutFlowStore.status).toBe('browser_open');
  });

  it('openAuth resolves a success callback -> reconcile -> owned', async () => {
    openAuth.mockResolvedValue(
      'pocketpal://app-return/success?purchase_id=pur_1',
    );
    checkPalOwnership.mockResolvedValueOnce({owned: true});
    await checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('finalizing');
    await jest.advanceTimersByTimeAsync(1000);
    expect(checkoutFlowStore.status).toBe('owned');
  });

  it('openAuth resolves a cancel callback -> cancelled, silent', async () => {
    openAuth.mockResolvedValue('pocketpal://app-return/cancel');
    await checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('cancelled');
  });

  it('openAuth rejects (user dismiss) -> cancelled, silent', async () => {
    openAuth.mockRejectedValue(new Error('auth_cancelled'));
    await checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('cancelled');
  });

  it('return with no active flow is ignored', () => {
    checkoutFlowStore.onReturn('pal-1', 'success');
    expect(checkoutFlowStore.status).toBe('idle');
  });

  it('reset returns to idle', async () => {
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    checkoutFlowStore.reset();
    expect(checkoutFlowStore.status).toBe('idle');
    expect(checkoutFlowStore.palId).toBeNull();
  });
});
