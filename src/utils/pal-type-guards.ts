/**
 * Type guards for proper discrimination between local and PalsHub pals
 *
 * These utilities provide type-safe ways to distinguish between different pal types
 * without relying on fragile property existence checks.
 */

import type {Pal} from '../types/pal';
import type {PalsHubPal} from '../types/palshub';

/**
 * Type guard to check if a pal is a local pal
 */
export function isLocalPal(pal: Pal | PalsHubPal): pal is Pal {
  return pal.type === 'local';
}

/**
 * Type guard to check if a pal is a PalsHub pal
 */
export function isPalsHubPal(pal: Pal | PalsHubPal): pal is PalsHubPal {
  return pal.type === 'palshub';
}

/**
 * Union type for all pal types
 */
export type AnyPal = Pal | PalsHubPal;

/**
 * Type-safe pal handler that ensures proper type discrimination
 */
export interface PalHandlers {
  onLocalPal: (pal: Pal) => void;
  onPalsHubPal: (pal: PalsHubPal) => void;
}

/**
 * Handle a pal with type-safe discrimination
 */
export function handlePalByType(pal: AnyPal, handlers: PalHandlers): void {
  if (isLocalPal(pal)) {
    handlers.onLocalPal(pal);
  } else if (isPalsHubPal(pal)) {
    handlers.onPalsHubPal(pal);
  } else {
    console.warn('Unknown pal type:', pal);
  }
}
