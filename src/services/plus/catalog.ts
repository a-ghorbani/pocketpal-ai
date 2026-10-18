export const PLUS_PRODUCT_IDS = [
  'plus.1',
  'plus.2',
  'plus.3',
  'plus.4',
] as const;

export const isPlusProduct = (productId: string): boolean =>
  (PLUS_PRODUCT_IDS as readonly string[]).includes(productId);

export interface PlusFeature {
  id: string;
  shipped: boolean;
  minRamGb?: number;
}

export const PLUS_FEATURES: readonly PlusFeature[] = [
  {id: 'handsFreeVoice', shipped: false},
  {id: 'localApiServer', shipped: false},
];
