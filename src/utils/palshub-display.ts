/**
 * PalsHub Display Utilities
 *
 * This module provides utilities for displaying PalsHub content with appropriate
 * labels and actions based on pricing and ownership.
 */

import type {PalsHubPal} from '../types/palshub';
import {l10n} from '../locales';
import {uiStore} from '../store';

/**
 * Get display label for a pal based on its pricing and protection level
 */
export function getPalDisplayLabel(pal: PalsHubPal): {
  label: string;
  type: 'free' | 'premium' | 'locked';
  showLabel: boolean;
} {
  // Free pals
  if (pal.price_cents === 0) {
    return {
      label: l10n[uiStore.language].palsScreen.labels.free,
      type: 'free',
      showLabel: true,
    };
  }

  // Paid pals - use protection level to determine label
  if (pal.protection_level === 'reveal_on_purchase') {
    return {
      label: l10n[uiStore.language].palsScreen.labels.premium,
      type: 'premium',
      showLabel: true,
    };
  }

  // Private pals (shouldn't normally be visible, but handle gracefully)
  if (pal.protection_level === 'private') {
    return {
      label: l10n[uiStore.language].palsScreen.labels.private,
      type: 'locked',
      showLabel: true,
    };
  }

  // Public paid pals (edge case - treat as premium)
  return {
    label: l10n[uiStore.language].palsScreen.labels.premium,
    type: 'premium',
    showLabel: true,
  };
}

/**
 * Check if a pal is free
 */
export function isPalFree(pal: PalsHubPal): boolean {
  return pal.price_cents === 0;
}

/**
 * Filter labels for the UI
 */
export const PAL_FILTER_LABELS = {
  all: l10n[uiStore.language].palsScreen.filters.all,
  'my-pals': l10n[uiStore.language].palsScreen.filters.myPals,
  local: l10n[uiStore.language].palsScreen.filters.local,
  video: l10n[uiStore.language].palsScreen.filters.video,
  free: l10n[uiStore.language].palsScreen.filters.free,
  premium: l10n[uiStore.language].palsScreen.filters.premium,
} as const;

/**
 * Get action text for pal cards
 * Returns null for premium pals to indicate no action should be shown
 */
export function getPalActionText(
  pal: PalsHubPal,
  isOwned: boolean,
): string | null {
  if (isOwned) {
    return l10n[uiStore.language].palsScreen.labels.download;
  }

  if (isPalFree(pal)) {
    return l10n[uiStore.language].palsScreen.labels.getFree;
  }

  // For premium pals, no action button should be shown
  return null;
}

/**
 * Check if we should show full pal content based on ownership and protection level
 */
export function shouldShowPalContent(pal: PalsHubPal): boolean {
  // Always show free content if protect level is public
  if (isPalFree(pal)) {
    return pal.protection_level === 'public';
  }

  // Show premium content only if owned
  return !!pal.is_owned;
}

/**
 * Get sort options for pals
 */
export const PAL_SORT_OPTIONS = [
  {key: 'newest', label: l10n[uiStore.language].palsScreen.sortOptions.newest},
  {key: 'oldest', label: l10n[uiStore.language].palsScreen.sortOptions.oldest},
  {key: 'rating', label: l10n[uiStore.language].palsScreen.sortOptions.rating},
  {
    key: 'popular',
    label: l10n[uiStore.language].palsScreen.sortOptions.popular,
  },
] as const;
