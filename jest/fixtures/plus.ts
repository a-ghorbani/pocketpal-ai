import {l10n} from '../../src/locales';
import type {PlusFeature} from '../../src/services/plus/catalog';
import type {
  PlusFeatureRow,
  PlusFeatureStatus,
} from '../../src/services/plus/features';

export const fakePlusFeatures = (
  list: {id: string; shipped: boolean; minRamGb?: number}[],
): PlusFeature[] => list as unknown as PlusFeature[];

export const fakePlusRows = (
  list: {id: string; status: PlusFeatureStatus}[],
): PlusFeatureRow[] => list as unknown as PlusFeatureRow[];

export const fakePlusL10n = {
  ...l10n.en,
  plus: {
    ...l10n.en.plus,
    features: {
      ...l10n.en.plus.features,
      open: 'Open feature',
      big: 'Big feature',
      bigger: 'Bigger feature',
      later: 'Later feature',
      third: 'Third feature',
    },
  },
} as typeof l10n.en;
