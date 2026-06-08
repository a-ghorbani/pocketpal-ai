import {makeAutoObservable, runInAction} from 'mobx';

import {PALSHUB_API_BASE_URL} from '@env';

import NativeAuthSession from '../specs/NativeAuthSession';
import NativeExternalContentLink from '../specs/NativeExternalContentLink';
import {palsHubApiService} from '../services/palshub/PalsHubApiService';
import {palsHubService} from '../services';

/**
 * CheckoutFlowStore
 *
 * App-global owner of the PalsHub in-app checkout state on both platforms. Sole
 * writer of checkout state; ownership is never written here (read live from the
 * server). The checkout page is opened via the native auth session
 * (ASWebAuthenticationSession on iOS, Chrome Custom Tab on Android); its
 * success/cancel callback arrives on the session promise and is consumed inline.
 */

export type CheckoutStatus =
  | 'idle'
  | 'creating'
  | 'linking'
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

// Defense-in-depth: only an https URL on a known checkout host is ever handed
// to the auth/payment surface. The contract is a Stripe-hosted checkout_url;
// the PalsHub host is allowed too in case it serves/redirects the page itself.
const isAllowedCheckoutUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const palsHubHost = new URL(PALSHUB_API_BASE_URL).hostname.toLowerCase();

    // E2E only: the automated harness's test-complete page is served by the
    // LAN test server over http. Dev and prod stay https-only (`__E2E__` is
    // false in both), so dev exercises the real Stripe checkout.
    if (__E2E__ && host === palsHubHost) {
      return true;
    }

    if (url.protocol !== 'https:') {
      return false;
    }
    if (host === 'stripe.com' || host.endsWith('.stripe.com')) {
      return true;
    }
    return host === palsHubHost;
  } catch {
    return false;
  }
};

class CheckoutFlowStore {
  status: CheckoutStatus = 'idle';
  palId: string | null = null;
  purchaseId?: string;
  errorKind?: CheckoutErrorKind;

  // Fresh external-transaction token from the Android link-out prep, held only
  // between prep and the post-ownership report; never persisted, cleared on reset.
  private reportToken?: string;

  // Bumped on reset to abort an in-flight reconcile poll.
  private epoch = 0;

  constructor() {
    makeAutoObservable(this);
  }

  // True while a checkout is in flight; a new press is a no-op then.
  // Includes linking (Play disclosure) and browser_open so a second start
  // cannot run while the link-out prep or the auth session is presented.
  get isInFlight(): boolean {
    return (
      this.status === 'creating' ||
      this.status === 'linking' ||
      this.status === 'browser_open' ||
      this.status === 'finalizing'
    );
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
    // Pin to the current epoch: a reset() during the create network window
    // bumps the epoch, so a resolved (or rejected) session must not reopen a
    // stray tab or clobber the now-idle flow.
    const myEpoch = this.epoch;

    const successUrl = `${PALSHUB_API_BASE_URL}/app-return/checkout/success`;
    const cancelUrl = `${PALSHUB_API_BASE_URL}/app-return/checkout/cancel`;

    try {
      const session = await palsHubApiService.createCheckoutSession(palId, {
        successUrl,
        cancelUrl,
      });
      if (this.epoch !== myEpoch) {
        return;
      }
      if (!isAllowedCheckoutUrl(session.checkout_url)) {
        throw new Error('checkout_url is not an allowed checkout host');
      }
      runInAction(() => {
        this.purchaseId = session.purchase_id;
      });
      // The spec is null only as an Android build/registration defect (the
      // module not added to getPackages); that maps to a silent cancel here
      // rather than crashing on a null openAuth. On iOS it is always present.
      const authSession = NativeAuthSession;
      if (!authSession) {
        this.setStatus('browser_open');
        this.onReturn(palId, 'cancel');
        return;
      }
      // Android (link-out prep present): run eligibility -> token ->
      // launchExternalLink (Play renders its disclosure) before the tab; the
      // Custom Tab opens only on 'launched'. iOS (prep absent) opens directly.
      const linkPrep = NativeExternalContentLink;
      if (linkPrep) {
        this.setStatus('linking');
        const prep = await linkPrep.prepareExternalLink(session.checkout_url);
        if (this.epoch !== myEpoch) {
          return;
        }
        if (prep.outcome === 'launched') {
          this.reportToken = prep.token;
          this.setStatus('browser_open');
          await this.openAuthAndHandle(
            authSession,
            palId,
            session.checkout_url,
          );
          return;
        }
        if (prep.outcome === 'error') {
          runInAction(() => {
            this.errorKind = 'network';
            this.status = 'error';
          });
          return;
        }
        // 'user_canceled' (Play disclosure declined) or 'ineligible': silent.
        this.setStatus('cancelled');
        return;
      }
      this.setStatus('browser_open');
      await this.openAuthAndHandle(authSession, palId, session.checkout_url);
    } catch (error) {
      if (this.epoch !== myEpoch) {
        return;
      }
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

  // Open the checkout page in the native auth session (ASWebAuthenticationSession
  // on iOS, Chrome Custom Tab on Android) and consume the captured
  // pocketpal://checkout/{success|cancel} callback. A reject (user-dismiss /
  // session error) is a silent cancel (matches a cancel callback).
  private async openAuthAndHandle(
    authSession: NonNullable<typeof NativeAuthSession>,
    palId: string,
    checkoutUrl: string,
  ) {
    // Pin this auth session to the current epoch. A reset (and any newer
    // checkout it allows) bumps the epoch, so a late callback from this
    // session is dropped rather than mutating the newer flow.
    const myEpoch = this.epoch;
    let callback: string;
    try {
      callback = await authSession.openAuth(checkoutUrl, CALLBACK_SCHEME);
    } catch {
      if (this.epoch !== myEpoch) {
        return;
      }
      this.onReturn(palId, 'cancel');
      return;
    }
    if (this.epoch !== myEpoch) {
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
          this.reportExternalContentLink();
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

  // Best-effort External Content Links report, fired once after reconcile
  // confirms ownership (Android only — the spec is null on iOS). Threads the
  // token minted during the link-out prep. Never gates, blocks, or fails the
  // checkout: a rejection is swallowed and the state is untouched. Not fired on
  // the already-owned (400) path: no external transaction occurred.
  private reportExternalContentLink() {
    const purchaseId = this.purchaseId;
    const token = this.reportToken;
    if (!NativeExternalContentLink || !purchaseId || !token) {
      return;
    }
    NativeExternalContentLink.reportExternalContentLink(
      purchaseId,
      token,
    ).catch(() => {});
  }

  reset() {
    runInAction(() => {
      this.epoch += 1;
      this.status = 'idle';
      this.palId = null;
      this.purchaseId = undefined;
      this.errorKind = undefined;
      this.reportToken = undefined;
    });
  }
}

export const checkoutFlowStore = new CheckoutFlowStore();
