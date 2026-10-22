import type {PlusFeature, PlusFeatureId} from './catalog';

export const RAM_MARKETING_FACTOR = 0.85;

/** `optIn`: runs here only once the user turns it on in Settings. */
export type PlusFeatureStatus = 'ready' | 'optIn' | 'soon' | {needsGb: number};

export interface PlusFeatureRow {
  id: PlusFeatureId;
  status: PlusFeatureStatus;
}

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
  optIn: ReadonlySet<string> = new Set(),
): PlusFeatureRow[] =>
  features.flatMap((feature): PlusFeatureRow[] => {
    const {id, minRamGb} = feature;
    if (!isShipped(feature, override)) {
      return [{id, status: 'soon'}];
    }
    const ready = optIn.has(id) ? 'optIn' : 'ready';
    if (minRamGb === undefined) {
      return [{id, status: ready}];
    }
    if (ramBytes === null) {
      return [];
    }
    return [
      {
        id,
        status: meetsRam(ramBytes, minRamGb) ? ready : {needsGb: minRamGb},
      },
    ];
  });

export const anyRunnable = (rows: readonly PlusFeatureRow[]): boolean =>
  rows.some(row => row.status === 'ready' || row.status === 'optIn');

export const shippedFeatures = (
  features: readonly PlusFeature[],
  override: ReadonlySet<string>,
): PlusFeature[] => features.filter(feature => isShipped(feature, override));
