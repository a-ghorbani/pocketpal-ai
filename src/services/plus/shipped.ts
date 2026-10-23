import {PLUS_FEATURES} from './catalog';
import type {PlusFeature} from './catalog';
import {deviceRam} from './deviceRam';
import {featureRows, shippedFeatures} from './features';
import type {OptInReason, PlusFeatureRow} from './features';
import {shipOverride} from './shipOverride';
import {voiceModeStore} from '../../store';

export const shippedPlusFeatures = (): PlusFeature[] =>
  shippedFeatures(PLUS_FEATURES, shipOverride.get());

const needsOptIn = (): ReadonlyMap<string, OptInReason> =>
  new Map(
    voiceModeStore.supported
      ? []
      : [
          [
            'handsFreeVoice',
            voiceModeStore.deviceSupported ? 'offInSettings' : 'belowGate',
          ],
        ],
  );

export const plusFeatureRows = (): PlusFeatureRow[] =>
  featureRows(
    PLUS_FEATURES,
    deviceRam.ramBytes,
    shipOverride.get(),
    needsOptIn(),
  );
