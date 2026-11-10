import type {PlusFeature, PlusFeatureId} from './catalog';

export const RAM_MARKETING_FACTOR = 0.85;

/** `optIn`: runs here only once the user turns it on in Settings. */
export type PlusFeatureStatus = 'ready' | 'optIn' | 'soon' | {needsGb: number};

/** Why an `optIn` row is off: below the device gate, or turned off by the user. */
export type OptInReason = 'belowGate' | 'offInSettings';

export type PlusFeatureRow =
  | {id: PlusFeatureId; status: Exclude<PlusFeatureStatus, 'optIn'>}
  | {id: PlusFeatureId; status: 'optIn'; reason: OptInReason};

export const isShipped = (
  feature: PlusFeature,
  override: ReadonlySet<string>,
): boolean => feature.shipped || override.has(feature.id);

export const meetsRam = (ramBytes: number, minRamGb: number): boolean =>
  ramBytes >= minRamGb * RAM_MARKETING_FACTOR * 1e9;

export const featureRows = (
  features: readonly PlusFeature[],
  ramBytes: number | null,
  override: ReadonlySet<string>,
  optIn: ReadonlyMap<string, OptInReason> = new Map(),
): PlusFeatureRow[] =>
  features.flatMap((feature): PlusFeatureRow[] => {
    const {id, minRamGb} = feature;
    if (!isShipped(feature, override)) {
      return [{id, status: 'soon'}];
    }
    const reason = optIn.get(id);
    const runnable: PlusFeatureRow = reason
      ? {id, status: 'optIn', reason}
      : {id, status: 'ready'};
    if (minRamGb === undefined) {
      return [runnable];
    }
    if (ramBytes === null) {
      return [];
    }
    return [
      meetsRam(ramBytes, minRamGb)
        ? runnable
        : {id, status: {needsGb: minRamGb}},
    ];
  });

export const anyRunnable = (rows: readonly PlusFeatureRow[]): boolean =>
  rows.some(row => row.status === 'ready' || row.status === 'optIn');

export const shippedFeatures = (
  features: readonly PlusFeature[],
  override: ReadonlySet<string>,
): PlusFeature[] => features.filter(feature => isShipped(feature, override));
