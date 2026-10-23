import {observable, runInAction} from 'mobx';

import {readDeviceSignals} from '../deviceRules/signals';

export const deviceRam = observable({ramBytes: null as number | null});

let reading: Promise<void> | null = null;

export const ensureRamRead = (): Promise<void> => {
  if (!reading) {
    reading = readDeviceSignals().then(({ramBytes}) =>
      runInAction(() => {
        deviceRam.ramBytes = ramBytes;
      }),
    );
  }
  return reading;
};
