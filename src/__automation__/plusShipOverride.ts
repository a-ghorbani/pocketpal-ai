import AsyncStorage from '@react-native-async-storage/async-storage';

import {PLUS_FEATURES} from '../services/plus/catalog';
import {setShipOverride} from '../services/plus/shipOverride';

export const PLUS_SHIP_KEY = 'e2e.plusShip';
const MARKER = 'PLUS_SHIP_OVERRIDE';

const isKnownFeature = (id: string): boolean =>
  PLUS_FEATURES.some(feature => feature.id === id);

const parseIds = (arg: string): string[] =>
  arg === 'none'
    ? []
    : arg
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);

class PlusShipOverride {
  set = async (arg: string): Promise<string> => {
    const ids = parseIds(arg);
    const unknown = ids.find(id => !isKnownFeature(id));
    if (unknown !== undefined) {
      return `${MARKER} unknown feature: ${unknown}`;
    }
    setShipOverride(ids);
    await AsyncStorage.setItem(PLUS_SHIP_KEY, JSON.stringify(ids));
    return `${MARKER} ${ids.length > 0 ? ids.join(',') : 'none'}`;
  };

  restore = async (): Promise<void> => {
    let ids: string[] = [];
    try {
      const stored: unknown = JSON.parse(
        (await AsyncStorage.getItem(PLUS_SHIP_KEY)) ?? '[]',
      );
      if (Array.isArray(stored)) {
        ids = stored.filter(
          (id): id is string => typeof id === 'string' && isKnownFeature(id),
        );
      }
    } catch {
      ids = [];
    }
    setShipOverride(ids);
  };
}

export const plusShipOverride = new PlusShipOverride();
