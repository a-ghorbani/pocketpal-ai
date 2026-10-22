import {PLUS_FEATURES} from './catalog';
import type {PlusFeature} from './catalog';
import {deviceRam} from './deviceRam';
import {featureRows, shippedFeatures} from './features';
import type {PlusFeatureRow} from './features';
import {shipOverride} from './shipOverride';

export const shippedPlusFeatures = (): PlusFeature[] =>
  shippedFeatures(PLUS_FEATURES, shipOverride.get());

export const plusFeatureRows = (): PlusFeatureRow[] =>
  featureRows(PLUS_FEATURES, deviceRam.ramBytes, shipOverride.get());
