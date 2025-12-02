/**
 * Hexagon DSP detection and version mapping utilities
 * Based on Qualcomm Snapdragon SoC chipsets
 */

import {getAvailableDevices} from './deviceSelection';

export type HexagonVersion = '690' | '730' | '750' | '790' | '810';

export interface HexagonInfo {
  version: HexagonVersion;
  deviceName: string;
  soc: string;
  supported: boolean;
}

/**
 * Supported Hexagon DSP versions and their corresponding SoCs
 */
const HEXAGON_VERSION_MAP: Record<
  HexagonVersion,
  {socs: string[]; displayName: string}
> = {
  '690': {
    socs: ['Snapdragon 855', 'Snapdragon 865', 'SM8150', 'SM8250'],
    displayName: 'Hexagon 690',
  },
  '730': {
    socs: ['Snapdragon 888', 'Snapdragon 8 Gen 1', 'SM8350', 'SM8450'],
    displayName: 'Hexagon 730',
  },
  '750': {
    socs: ['Snapdragon 8 Gen 2', 'SM8550'],
    displayName: 'Hexagon 750',
  },
  '790': {
    socs: ['Snapdragon 8 Gen 3', 'SM8650'],
    displayName: 'Hexagon 790',
  },
  '810': {
    socs: ['Snapdragon 8 Elite', 'SM8750'],
    displayName: 'Hexagon 810',
  },
};

/**
 * Detect Hexagon version from chipset/SoC name
 * The device info doesn't contain version metadata, so we infer from chipset
 */
function detectHexagonVersion(chipset?: string): HexagonVersion | null {
  // Try to infer from chipset/SoC name
  if (chipset) {
    const chipsetLower = chipset.toLowerCase();
    for (const [version, info] of Object.entries(HEXAGON_VERSION_MAP)) {
      if (info.socs.some(soc => chipsetLower.includes(soc.toLowerCase()))) {
        return version as HexagonVersion;
      }
    }
  }

  return null;
}

/**
 * Get SoC name for a Hexagon version
 */
export function getSoCForHexagonVersion(version: HexagonVersion): string {
  return HEXAGON_VERSION_MAP[version]?.socs[0] || 'Unknown';
}

/**
 * Get display name for Hexagon version
 */
export function getHexagonDisplayName(version: HexagonVersion): string {
  return HEXAGON_VERSION_MAP[version]?.displayName || `Hexagon ${version}`;
}

/**
 * Check if a Hexagon version is supported by the app
 */
export function isHexagonVersionSupported(version: HexagonVersion): boolean {
  // All versions in the map are supported
  return version in HEXAGON_VERSION_MAP;
}

/**
 * Get all available Hexagon DSPs on the device
 * @param chipset Optional chipset info from device capabilities
 * @returns Array of detected Hexagon DSP info
 */
export async function getHexagonInfo(chipset?: string): Promise<HexagonInfo[]> {
  try {
    const devices = await getAvailableDevices();
    const hexagonDevices = devices.filter(d => d.deviceName?.startsWith('HTP'));

    const hexagonInfo: HexagonInfo[] = [];

    // Detect version from chipset (all HTP devices share same version on a device)
    const version = detectHexagonVersion(chipset);

    if (version && hexagonDevices.length > 0) {
      hexagonInfo.push({
        version,
        deviceName: hexagonDevices.map(d => d.deviceName).join(', '),
        soc: getSoCForHexagonVersion(version),
        supported: isHexagonVersionSupported(version),
      });
    }

    return hexagonInfo;
  } catch (error) {
    console.warn('Failed to detect Hexagon info:', error);
    return [];
  }
}

/**
 * Check if device has any supported Hexagon DSP
 */
export async function hasSupportedHexagon(): Promise<boolean> {
  const hexagonInfo = await getHexagonInfo();
  return hexagonInfo.some(info => info.supported);
}
