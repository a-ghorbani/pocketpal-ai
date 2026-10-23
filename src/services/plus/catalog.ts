import type {Translations} from '../../locales/types';

export const PLUS_PRODUCT_IDS = [
  'plus.1',
  'plus.2',
  'plus.3',
  'plus.4',
] as const;

export const isPlusProduct = (productId: string): boolean =>
  (PLUS_PRODUCT_IDS as readonly string[]).includes(productId);

export type PlusFeatureId = keyof Translations['plus']['features'];

export interface PlusFeature {
  id: PlusFeatureId;
  shipped: boolean;
  minRamGb?: number;
}

export const PLUS_FEATURES: readonly PlusFeature[] = [
  {id: 'handsFreeVoice', shipped: true},
  {id: 'localApiServer', shipped: false},
];
