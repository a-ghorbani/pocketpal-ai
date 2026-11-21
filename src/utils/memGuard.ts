import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

import NativeHardwareInfo from '../specs/NativeHardwareInfo';
import {memMark} from './memRecorder';

// Spike: memory tripwire thresholds, read from memtrip.json so they can be tuned without a rebuild.
export interface MemTripConfig {
  swapKb?: number; // load: abort when own swap grows past this during the weights
  memAvailKb?: number; // load: abort when MemAvailable drops below this
  floorKb?: number; // load end: abort when MemAvailable - remaining need < this
  turnSwapKb?: number; // before a reply: refuse when own swap grew past this since the load started
  genSwapKb?: number; // during a reply: stop when own swap grew past this since the load started
}

let config: MemTripConfig = {};
let swapBaselineKb = -1;

const configPath = () =>
  `${Platform.OS === 'android' ? RNFS.ExternalDirectoryPath : RNFS.DocumentDirectoryPath}/memtrip.json`;

export async function loadMemTripConfig(): Promise<MemTripConfig> {
  try {
    config = JSON.parse(await RNFS.readFile(configPath()));
  } catch {
    config = {};
  }
  return config;
}

export async function noteLoadStart(): Promise<void> {
  try {
    swapBaselineKb = (await NativeHardwareInfo.getMemorySignals()).swapKb;
  } catch {
    swapBaselineKb = -1;
  }
}

export function loadTripwireParams(remainingKb: number): Record<string, number> {
  return {
    tripwire_swap_kb: config.swapKb ?? 0,
    tripwire_mem_avail_kb: config.memAvailKb ?? 0,
    tripwire_floor_kb: config.floorKb ?? 0,
    tripwire_remaining_kb: Math.max(0, Math.round(remainingKb)),
  };
}

async function swapGrowthKb(): Promise<number> {
  const s = await NativeHardwareInfo.getMemorySignals();
  return swapBaselineKb < 0 ? 0 : s.swapKb - swapBaselineKb;
}

export class MemoryGuardError extends Error {}

export async function beforeTurn(): Promise<void> {
  if (!config.turnSwapKb) {
    return;
  }
  const growth = await swapGrowthKb();
  if (growth > config.turnSwapKb) {
    memMark(`guard:turn-block swap_growth_kb=${growth}`);
    throw new MemoryGuardError(
      'Not enough memory to reply safely: the model is being swapped out. Try a smaller context or model.',
    );
  }
}

export function watchGeneration(stop: () => void): () => void {
  if (!config.genSwapKb) {
    return () => {};
  }
  let stopped = false;
  const timer = setInterval(async () => {
    try {
      const growth = await swapGrowthKb();
      if (!stopped && growth > (config.genSwapKb ?? Infinity)) {
        stopped = true;
        memMark(`guard:gen-stop swap_growth_kb=${growth}`);
        stop();
      }
    } catch {}
  }, 250);
  return () => clearInterval(timer);
}
