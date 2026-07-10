/**
 * CheckoutFlowStore — checkout state machine and reconcile poll.
 */

jest.mock('../../services/palshub/PalsHubApiService', () => ({
  palsHubApiService: {createCheckoutSession: jest.fn()},
}));
jest.mock('../../services', () => ({
  palsHubService: {checkPalOwnership: jest.fn()},
}));

jest.mock('../../specs/NativeAuthSession', () => ({
  __esModule: true,
  default: {openAuth: jest.fn()},
}));

jest.mock('../../specs/NativeExternalContentLink', () => ({
  __esModule: true,
  default: {
    prepareExternalLink: jest.fn(),
    reportExternalContentLink: jest.fn(),
  },
}));

import {palsHubApiService} from '../../services/palshub/PalsHubApiService';
import {palsHubService} from '../../services';
import NativeAuthSession from '../../specs/NativeAuthSession';
import NativeExternalContentLink from '../../specs/NativeExternalContentLink';
import {checkoutFlowStore} from '../CheckoutFlowStore';

const createSession = palsHubApiService.createCheckoutSession as jest.Mock;
const checkPalOwnership = palsHubService.checkPalOwnership as jest.Mock;
const openAuth = (NativeAuthSession as unknown as {openAuth: jest.Mock})
  .openAuth;
const prepareExternalLink = (
  NativeExternalContentLink as unknown as {prepareExternalLink: jest.Mock}
).prepareExternalLink;
const reportExternalContentLink = (
  NativeExternalContentLink as unknown as {reportExternalContentLink: jest.Mock}
).reportExternalContentLink;

const session = {
  checkout_url: 'https://checkout.stripe.com/c/pay/cs_1',
  session_url: 'https://checkout.stripe.com/c/pay/cs_1',
  session_id: 'cs_1',
  purchase_id: 'pur_1',
  platform_fee_cents: 50,
};

const flushMicrotasks = async () => {
  await Promise.resolve();
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
    reportExternalContentLink.mockResolvedValue(undefined);
    // Default (Android with the link-out prep present): prep launches so the
    // happy-path tests reach the Custom Tab. The 'linking' describe overrides
    // the outcome per case; the iOS-shaped describe nulls the spec entirely.
    prepareExternalLink.mockResolvedValue({
      outcome: 'launched',
      token: 'tok_1',
    });
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

  it('200 -> linking -> launched -> browser_open and opens the auth session', async () => {
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(createSession).toHaveBeenCalledWith(
      'pal-1',
      expect.objectContaining({
        successUrl: expect.stringContaining('/app-return/checkout/success'),
        cancelUrl: expect.stringContaining('/app-return/checkout/cancel'),
      }),
    );
    expect(prepareExternalLink).toHaveBeenCalledWith(session.checkout_url);
    expect(openAuth).toHaveBeenCalledWith(session.checkout_url, 'pocketpal');
    expect(checkoutFlowStore.status).toBe('browser_open');
    expect(checkoutFlowStore.purchaseId).toBe('pur_1');
  });

  it('400 already owned -> owned without prep, auth session, or reporting', async () => {
    createSession.mockRejectedValue({details: {status: 'already_owned'}});
    await checkoutFlowStore.start('pal-1');
    expect(prepareExternalLink).not.toHaveBeenCalled();
    expect(openAuth).not.toHaveBeenCalled();
    expect(checkoutFlowStore.status).toBe('owned');
    // No external transaction occurred via this flow.
    expect(reportExternalContentLink).not.toHaveBeenCalled();
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

  it('a press while linking is a no-op (double-tap during the Play disclosure)', async () => {
    prepareExternalLink.mockReturnValue(new Promise(() => {})); // never resolves
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('linking');
    expect(checkoutFlowStore.isInFlight).toBe(true);
    await checkoutFlowStore.start('pal-2');
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(prepareExternalLink).toHaveBeenCalledTimes(1);
  });

  it('a press while browser_open is a no-op', async () => {
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('browser_open');
    await checkoutFlowStore.start('pal-2');
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(openAuth).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['non-https', 'http://checkout.stripe.com/c/1'],
    ['unexpected host', 'https://evil.example/c/1'],
  ])(
    'rejects a %s checkout_url -> error, prep and auth session not opened',
    async (_label, checkout_url) => {
      createSession.mockResolvedValue({...session, checkout_url});
      await checkoutFlowStore.start('pal-1');
      expect(prepareExternalLink).not.toHaveBeenCalled();
      expect(openAuth).not.toHaveBeenCalled();
      expect(checkoutFlowStore.status).toBe('error');
    },
  );

  it('a stale same-pal callback does not mutate a newer flow', async () => {
    // First flow parks in browser_open with a controllable auth promise.
    let resolveOld!: (value: string) => void;
    openAuth.mockReturnValueOnce(
      new Promise<string>(resolve => {
        resolveOld = resolve;
      }),
    );
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('browser_open');

    // Reset, then a new checkout for the same pal parks again.
    checkoutFlowStore.reset();
    openAuth.mockReturnValueOnce(new Promise(() => {}));
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('browser_open');

    // The OLD session now resolves a cancel callback; it must be ignored.
    resolveOld('pocketpal://checkout/cancel');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('browser_open');
  });

  describe('Android link-out prep (linking status)', () => {
    it("'launched' -> stashes the token, opens the Custom Tab", async () => {
      prepareExternalLink.mockResolvedValue({
        outcome: 'launched',
        token: 'tok_x',
      });
      checkoutFlowStore.start('pal-1');
      await flushMicrotasks();
      expect(checkoutFlowStore.status).toBe('browser_open');
      expect(openAuth).toHaveBeenCalledWith(session.checkout_url, 'pocketpal');
    });

    it("'user_canceled' (Play disclosure declined) -> cancelled, no tab, no report", async () => {
      prepareExternalLink.mockResolvedValue({outcome: 'user_canceled'});
      await checkoutFlowStore.start('pal-1');
      await flushMicrotasks();
      expect(checkoutFlowStore.status).toBe('cancelled');
      expect(openAuth).not.toHaveBeenCalled();
      expect(reportExternalContentLink).not.toHaveBeenCalled();
    });

    it("'ineligible' -> cancelled, no tab, no report", async () => {
      prepareExternalLink.mockResolvedValue({outcome: 'ineligible'});
      await checkoutFlowStore.start('pal-1');
      await flushMicrotasks();
      expect(checkoutFlowStore.status).toBe('cancelled');
      expect(openAuth).not.toHaveBeenCalled();
      expect(reportExternalContentLink).not.toHaveBeenCalled();
    });

    it("'error' -> error('network'), no tab", async () => {
      prepareExternalLink.mockResolvedValue({outcome: 'error'});
      await checkoutFlowStore.start('pal-1');
      await flushMicrotasks();
      expect(checkoutFlowStore.status).toBe('error');
      expect(checkoutFlowStore.errorKind).toBe('network');
      expect(openAuth).not.toHaveBeenCalled();
    });

    it('reset during the prep await drops the resolved result (no tab)', async () => {
      let resolvePrep!: (v: {outcome: string; token?: string}) => void;
      prepareExternalLink.mockReturnValue(
        new Promise(resolve => {
          resolvePrep = resolve;
        }),
      );
      checkoutFlowStore.start('pal-1');
      await flushMicrotasks();
      expect(checkoutFlowStore.status).toBe('linking');

      // Close the sheet (epoch bump) while prep is still pending.
      checkoutFlowStore.reset();
      resolvePrep({outcome: 'launched', token: 'tok_late'});
      await flushMicrotasks();

      expect(checkoutFlowStore.status).toBe('idle');
      expect(openAuth).not.toHaveBeenCalled();
    });

    it('prep rejecting -> error(network), no tab, no report', async () => {
      prepareExternalLink.mockRejectedValue(new Error('native failure'));
      await checkoutFlowStore.start('pal-1');
      await flushMicrotasks();
      expect(checkoutFlowStore.status).toBe('error');
      expect(checkoutFlowStore.errorKind).toBe('network');
      expect(openAuth).not.toHaveBeenCalled();
      expect(reportExternalContentLink).not.toHaveBeenCalled();
    });

    it("'launched' without a token -> opens the tab; later owned does not report", async () => {
      prepareExternalLink.mockResolvedValue({outcome: 'launched'});
      checkPalOwnership.mockResolvedValueOnce({owned: true});
      openAuth.mockResolvedValueOnce('pocketpal://checkout/success');
      await checkoutFlowStore.start('pal-1');
      await flushMicrotasks();
      await jest.advanceTimersByTimeAsync(1000);
      expect(checkoutFlowStore.status).toBe('owned');
      expect(reportExternalContentLink).not.toHaveBeenCalled();
    });
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

  describe('external content link reporting', () => {
    beforeEach(async () => {
      checkoutFlowStore.start('pal-1'); // -> browser_open (session pending)
      await flushMicrotasks();
    });

    it('reports once with the purchase id and prep token on reconcile-success owned', async () => {
      checkPalOwnership.mockResolvedValueOnce({owned: true});
      checkoutFlowStore.onReturn('pal-1', 'success');
      await jest.advanceTimersByTimeAsync(1000);
      expect(checkoutFlowStore.status).toBe('owned');
      expect(reportExternalContentLink).toHaveBeenCalledTimes(1);
      expect(reportExternalContentLink).toHaveBeenCalledWith('pur_1', 'tok_1');
    });

    it('does not report on cancel', async () => {
      checkoutFlowStore.onReturn('pal-1', 'cancel');
      expect(checkoutFlowStore.status).toBe('cancelled');
      expect(reportExternalContentLink).not.toHaveBeenCalled();
    });

    it('does not report on processing_deferred (webhook lag)', async () => {
      checkPalOwnership.mockResolvedValue({owned: false});
      checkoutFlowStore.onReturn('pal-1', 'success');
      await jest.advanceTimersByTimeAsync(30000);
      expect(checkoutFlowStore.status).toBe('processing_deferred');
      expect(reportExternalContentLink).not.toHaveBeenCalled();
    });

    it('a rejected report leaves the status owned (best-effort, swallowed)', async () => {
      reportExternalContentLink.mockRejectedValueOnce(
        new Error('reporting failed'),
      );
      checkPalOwnership.mockResolvedValueOnce({owned: true});
      checkoutFlowStore.onReturn('pal-1', 'success');
      await jest.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();
      expect(checkoutFlowStore.status).toBe('owned');
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
      'pocketpal://checkout/success?purchase_id=pur_1',
    );
    checkPalOwnership.mockResolvedValueOnce({owned: true});
    await checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('finalizing');
    await jest.advanceTimersByTimeAsync(1000);
    expect(checkoutFlowStore.status).toBe('owned');
  });

  it('openAuth resolves a cancel callback -> cancelled, silent', async () => {
    openAuth.mockResolvedValue('pocketpal://checkout/cancel');
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

  it('recovers after a dismiss: not in flight, and a fresh start works', async () => {
    // A tab back-out rejects openAuth -> cancelled. Buy must re-enable
    // (isInFlight false), and reset -> a second start must run, not be blocked.
    openAuth.mockRejectedValueOnce(new Error('auth_cancelled'));
    await checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('cancelled');
    expect(checkoutFlowStore.isInFlight).toBe(false);

    checkoutFlowStore.reset();
    expect(checkoutFlowStore.status).toBe('idle');

    openAuth.mockReturnValueOnce(new Promise(() => {}));
    checkoutFlowStore.start('pal-2');
    await flushMicrotasks();
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(checkoutFlowStore.status).toBe('browser_open');
  });

  it('openAuth resolves a malformed callback URL -> cancelled, silent', async () => {
    // URL parsing throws; the defensive catch treats it as a cancel.
    openAuth.mockResolvedValue('not a valid url');
    await checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('cancelled');
  });

  it('openAuth resolves an unexpected path -> cancelled, silent', async () => {
    // Well-formed URL whose trailing segment is neither success nor cancel
    // falls through to the cancel default — no reconcile, no error.
    openAuth.mockResolvedValue('pocketpal://checkout/unexpected');
    await checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('cancelled');
  });

  it('aborts the success reconcile when reset lands after the ownership check resolves', async () => {
    // Drive the epoch guard that sits AFTER the awaited checkPalOwnership:
    // resolve ownership only once the poll is parked on the first attempt,
    // then reset before the resolution is observed. Status must not flip.
    let resolveOwnership!: (v: {owned: boolean}) => void;
    checkPalOwnership.mockReturnValue(
      new Promise(resolve => {
        resolveOwnership = resolve;
      }),
    );
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    checkoutFlowStore.onReturn('pal-1', 'success');
    expect(checkoutFlowStore.status).toBe('finalizing');

    // Advance past the first backoff so the attempt issues the ownership call.
    await jest.advanceTimersByTimeAsync(1000);
    // Reset bumps the epoch while the ownership promise is still pending.
    checkoutFlowStore.reset();
    // Now let the stale ownership resolve as owned; the epoch guard must drop it.
    resolveOwnership({owned: true});
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('idle');
    expect(checkoutFlowStore.status).not.toBe('owned');
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

  it('drops a create that resolves after reset -> idle, no prep, opens no tab', async () => {
    // Close the sheet (reset bumps the epoch) while createCheckoutSession is
    // still in flight; the resolved session must not prep or reopen a tab.
    let resolveCreate!: (v: typeof session) => void;
    createSession.mockReturnValue(
      new Promise(resolve => {
        resolveCreate = resolve;
      }),
    );
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('creating');

    checkoutFlowStore.reset();
    resolveCreate(session);
    await flushMicrotasks();

    expect(checkoutFlowStore.status).toBe('idle');
    expect(prepareExternalLink).not.toHaveBeenCalled();
    expect(openAuth).not.toHaveBeenCalled();
  });

  it('drops an openAuth rejection that lands after reset -> idle, not cancelled', async () => {
    // The browser_open epoch guard: dismiss arrives (openAuth rejects) after
    // the sheet was already closed; the stale reject must not flip to cancelled.
    let rejectAuth!: (e: unknown) => void;
    openAuth.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectAuth = reject;
      }),
    );
    checkoutFlowStore.start('pal-1');
    await flushMicrotasks();
    expect(checkoutFlowStore.status).toBe('browser_open');

    checkoutFlowStore.reset();
    rejectAuth(new Error('dismissed'));
    await flushMicrotasks();

    expect(checkoutFlowStore.status).toBe('idle');
  });
});

describe('CheckoutFlowStore — iOS (link-out prep absent)', () => {
  // iOS has no External Content Links module: the spec is null, so start()
  // goes 200 -> browser_open directly with no prep and never reports.
  let store: {
    start: (palId: string) => Promise<void>;
    onReturn: (palId: string, kind: 'success' | 'cancel') => void;
    status: string;
  };
  let iosOpenAuth: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    iosOpenAuth = jest.fn().mockReturnValue(new Promise(() => {}));
    jest.doMock('../../services/palshub/PalsHubApiService', () => ({
      palsHubApiService: {
        createCheckoutSession: jest.fn().mockResolvedValue({
          checkout_url: 'https://checkout.stripe.com/c/pay/cs_1',
          session_url: 'https://checkout.stripe.com/c/pay/cs_1',
          session_id: 'cs_1',
          purchase_id: 'pur_1',
          platform_fee_cents: 50,
        }),
      },
    }));
    jest.doMock('../../services', () => ({
      palsHubService: {
        checkPalOwnership: jest.fn().mockResolvedValue({owned: false}),
      },
    }));
    jest.doMock('../../specs/NativeAuthSession', () => ({
      __esModule: true,
      default: {openAuth: iosOpenAuth},
    }));
    // iOS: the External Content Links spec is null (no native module).
    jest.doMock('../../specs/NativeExternalContentLink', () => ({
      __esModule: true,
      default: null,
    }));
    store = require('../CheckoutFlowStore').checkoutFlowStore;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('200 -> browser_open directly, no prep, opens the auth session', async () => {
    store.start('pal-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(iosOpenAuth).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/cs_1',
      'pocketpal',
    );
    expect(store.status).toBe('browser_open');
  });

  it('reconcile-success owned does not report (iOS never reports)', async () => {
    const iosServices = require('../../services');
    (
      iosServices.palsHubService.checkPalOwnership as jest.Mock
    ).mockResolvedValueOnce({
      owned: true,
    });
    store.start('pal-1');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    store.onReturn('pal-1', 'success');
    await jest.advanceTimersByTimeAsync(1000);
    expect(store.status).toBe('owned');
  });
});

describe('CheckoutFlowStore — auth-session spec unavailable', () => {
  // The auth-session spec is TurboModuleRegistry.get(...), null when the native
  // module is absent — reachable only on Android if the module is not added to
  // getPackages(). The guard must degrade to a silent cancel rather than crash
  // on a null .openAuth.
  it('null NativeAuthSession -> silent cancel, no crash', async () => {
    jest.resetModules();
    jest.doMock('../../services/palshub/PalsHubApiService', () => ({
      palsHubApiService: {
        createCheckoutSession: jest.fn().mockResolvedValue({
          checkout_url: 'https://checkout.stripe.com/c/pay/cs_1',
          session_url: 'https://checkout.stripe.com/c/pay/cs_1',
          session_id: 'cs_1',
          purchase_id: 'pur_1',
          platform_fee_cents: 50,
        }),
      },
    }));
    jest.doMock('../../services', () => ({
      palsHubService: {checkPalOwnership: jest.fn()},
    }));
    jest.doMock('../../specs/NativeAuthSession', () => ({
      __esModule: true,
      default: null,
    }));
    jest.doMock('../../specs/NativeExternalContentLink', () => ({
      __esModule: true,
      default: null,
    }));

    const {checkoutFlowStore: store} = require('../CheckoutFlowStore');

    await expect(store.start('pal-1')).resolves.toBeUndefined();
    expect(store.status).toBe('cancelled');
  });
});
