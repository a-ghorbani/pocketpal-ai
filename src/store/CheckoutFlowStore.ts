import {makeAutoObservable, runInAction} from 'mobx';

import {PALSHUB_API_BASE_URL} from '@env';

import NativeAuthSession from '../specs/NativeAuthSession';
import {palsHubApiService} from '../services/palshub/PalsHubApiService';
import {palsHubService} from '../services';

/**
 * CheckoutFlowStore
 *
 * App-global owner of the PalsHub in-app checkout state (iOS). Sole writer of
 * checkout state; ownership is never written here (read live from the server).
 * The checkout page is opened via ASWebAuthenticationSession; its success/cancel
 * callback arrives on the session promise and is consumed inline here.
 */

export type CheckoutStatus =
  | 'idle'
  | 'creating'
  | 'browser_open'
  | 'finalizing'
  | 'owned'
  | 'processing_deferred'
  | 'cancelled'
  | 'error';

export type CheckoutErrorKind = '401' | '404' | '500' | 'network';

// Host segment of the custom-scheme callback the auth session captures, namespacing
// the checkout return under the shared pocketpal:// scheme.
const CALLBACK_HOST = 'checkout';

const CALLBACK_SCHEME = 'pocketpal';

const RECONCILE_BACKOFFS_MS = [1000, 2000, 3000, 4000, 4000, 4000];

class CheckoutFlowStore {
  status: CheckoutStatus = 'idle';
  palId: string | null = null;
  purchaseId?: string;
  errorKind?: CheckoutErrorKind;

  // Bumped on reset to abort an in-flight reconcile poll.
  private epoch = 0;

  constructor() {
    makeAutoObservable(this);
  }

  // True while a checkout is in flight; a new press is a no-op then.
  get isInFlight(): boolean {
    return this.status === 'creating' || this.status === 'finalizing';
  }

  private setStatus(status: CheckoutStatus) {
    runInAction(() => {
      this.status = status;
    });
  }

  // Create a session and open the Stripe-hosted page via the auth session.
  async start(palId: string): Promise<void> {
    if (this.isInFlight) {
      return;
    }
    runInAction(() => {
      this.status = 'creating';
      this.palId = palId;
      this.purchaseId = undefined;
      this.errorKind = undefined;
    });

    const successUrl = `${PALSHUB_API_BASE_URL}/app-return/checkout/success`;
    const cancelUrl = `${PALSHUB_API_BASE_URL}/app-return/checkout/cancel`;

    try {
      const session = await palsHubApiService.createCheckoutSession(palId, {
        successUrl,
        cancelUrl,
      });
      runInAction(() => {
        this.purchaseId = session.purchase_id;
        this.status = 'browser_open';
      });
      // iOS-only flow; the spec is never null here, but guard rather than assert.
      const authSession = NativeAuthSession;
      if (!authSession) {
        this.onReturn(palId, 'cancel');
        return;
      }
      await this.openAuthAndHandle(authSession, palId, session.checkout_url);
    } catch (error) {
      const status = (error as {details?: {status?: unknown}})?.details?.status;
      if (status === 'already_owned') {
        this.setStatus('owned');
        return;
      }
      runInAction(() => {
        this.errorKind =
          status === 401
            ? '401'
            : status === 404
              ? '404'
              : status === 500
                ? '500'
                : 'network';
        this.status = 'error';
      });
    }
  }

  // Open the checkout page in ASWebAuthenticationSession and consume the
  // captured pocketpal://checkout/{success|cancel} callback. A reject
  // (user-dismiss / session error) is a silent cancel (matches a cancel callback).
  private async openAuthAndHandle(
    authSession: NonNullable<typeof NativeAuthSession>,
    palId: string,
    checkoutUrl: string,
  ) {
    let callback: string;
    try {
      callback = await authSession.openAuth(checkoutUrl, CALLBACK_SCHEME);
    } catch {
      this.onReturn(palId, 'cancel');
      return;
    }
    let kind: 'success' | 'cancel' = 'cancel';
    try {
      const url = new URL(callback);
      const action = url.pathname.split('/').filter(Boolean).pop();
      if (url.hostname === CALLBACK_HOST && action === 'success') {
        kind = 'success';
      }
    } catch {
      kind = 'cancel';
    }
    this.onReturn(palId, kind);
  }

  // Drive the flow from a captured callback. Ignored when it targets a
  // stale/closed flow. Success runs the ownership reconcile; cancel is silent.
  onReturn(palId: string | null, kind: 'success' | 'cancel') {
    if (this.status === 'idle' || !this.palId || this.palId !== palId) {
      return;
    }
    if (kind === 'cancel') {
      this.setStatus('cancelled');
      return;
    }
    this.reconcile(this.palId);
  }

  // Bounded ownership re-check after a success return. Any per-attempt failure
  // (owned:false OR thrown) is non-terminal; the first owned===true ends as
  // owned; exhausting attempts -> processing_deferred, never error.
  // Cancellable via the epoch token. Never writes ownership locally.
  private async reconcile(palId: string): Promise<void> {
    this.setStatus('finalizing');
    const myEpoch = this.epoch;

    for (let i = 0; i < RECONCILE_BACKOFFS_MS.length; i++) {
      await new Promise(resolve =>
        setTimeout(resolve, RECONCILE_BACKOFFS_MS[i]),
      );
      if (this.epoch !== myEpoch) {
        return;
      }
      try {
        const {owned} = await palsHubService.checkPalOwnership(palId);
        if (this.epoch !== myEpoch) {
          return;
        }
        if (owned) {
          this.setStatus('owned');
          return;
        }
      } catch {
        // Non-terminal: swallow and try the next attempt.
      }
    }

    if (this.epoch === myEpoch) {
      this.setStatus('processing_deferred');
    }
  }

  reset() {
    runInAction(() => {
      this.epoch += 1;
      this.status = 'idle';
      this.palId = null;
      this.purchaseId = undefined;
      this.errorKind = undefined;
    });
  }
}

export const checkoutFlowStore = new CheckoutFlowStore();
