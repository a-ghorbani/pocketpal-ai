import type {Tier} from '../deviceRules/types';

/**
 * Whether a device can run voice mode. High and flagship tiers anywhere;
 * mid-tier iPhones too: an iPhone 13 Pro (A15, 6 GB) classes as mid and
 * answered in 2.8–5.6 s. Android's mid tier also holds an 8 GB OnePlus 6
 * (SD845), where Whisper alone took 4–8 s, so it stays out there.
 */
export const voiceModeDeviceSupported = (
  tier: Tier | null,
  os: string,
): boolean =>
  tier === 'high' || tier === 'flagship' || (os === 'ios' && tier === 'mid');
