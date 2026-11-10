import {makeAutoObservable, observable} from 'mobx';

/** Where voice mode learns whether it is paid for. */
export interface VoiceEntitlementSource {
  /** Read inside a MobX reaction, so an observable source re-renders. */
  isUnlocked(): boolean;
  /** Shows the paywall; `onUnlocked` runs once a purchase unlocks voice mode. */
  openPaywall(opts: {onUnlocked: () => void}): void;
}

/**
 * The seam between voice mode and the purchase flow. Voice mode reads only
 * `source`; the purchase flow calls `register` once it can answer.
 */
export class VoiceEntitlement {
  source: VoiceEntitlementSource;

  constructor(defaultSource: VoiceEntitlementSource) {
    this.source = defaultSource;
    makeAutoObservable(this, {source: observable.ref});
  }

  register(source: VoiceEntitlementSource): void {
    this.source = source;
  }
}
