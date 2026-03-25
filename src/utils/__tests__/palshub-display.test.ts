import {
  getPalBuyUrl,
  getPalDisplayLabel,
  getPalActionText,
  isPalFree,
  isPalPremium,
  getPremiumInfoText,
  shouldShowPalContent,
} from '../palshub-display';
import {
  mockPalsHubPal,
  mockPremiumPalsHubPal,
  mockOwnedPremiumPal,
  mockPrivatePalsHubPal,
} from '../../../jest/fixtures/pals';

describe('palshub-display', () => {
  describe('getPalBuyUrl', () => {
    it('returns URL using PALSHUB_API_BASE_URL from env', () => {
      // PALSHUB_API_BASE_URL is 'https://palshub.ai' in __mocks__/external/@env.js
      expect(getPalBuyUrl('abc-123')).toBe('https://palshub.ai/pals/abc-123');
    });

    it('handles special characters in pal ID', () => {
      expect(getPalBuyUrl('pal-with-dashes')).toBe(
        'https://palshub.ai/pals/pal-with-dashes',
      );
    });
  });

  describe('getPalDisplayLabel', () => {
    it('returns free label for free pals', () => {
      const label = getPalDisplayLabel(mockPalsHubPal);
      expect(label.type).toBe('free');
      expect(label.showLabel).toBe(true);
    });

    it('returns premium label for reveal_on_purchase pals', () => {
      const label = getPalDisplayLabel(mockPremiumPalsHubPal);
      expect(label.type).toBe('premium');
      expect(label.showLabel).toBe(true);
    });

    it('returns locked label for private paid pals', () => {
      // mockPrivatePalsHubPal has price_cents: 0 (inherited from free pal),
      // so we need a paid private pal to trigger the 'locked' label
      const paidPrivatePal = {...mockPrivatePalsHubPal, price_cents: 500};
      const label = getPalDisplayLabel(paidPrivatePal);
      expect(label.type).toBe('locked');
      expect(label.showLabel).toBe(true);
    });
  });

  describe('isPalFree', () => {
    it('returns true for free pals', () => {
      expect(isPalFree(mockPalsHubPal)).toBe(true);
    });

    it('returns false for premium pals', () => {
      expect(isPalFree(mockPremiumPalsHubPal)).toBe(false);
    });
  });

  describe('isPalPremium', () => {
    it('returns true for premium pals', () => {
      expect(isPalPremium(mockPremiumPalsHubPal)).toBe(true);
    });

    it('returns false for free pals', () => {
      expect(isPalPremium(mockPalsHubPal)).toBe(false);
    });
  });

  describe('getPalActionText', () => {
    it('returns download text for owned pals', () => {
      const text = getPalActionText(mockOwnedPremiumPal, true);
      expect(text).not.toBeNull();
    });

    it('returns get free text for free pals', () => {
      const text = getPalActionText(mockPalsHubPal, false);
      expect(text).not.toBeNull();
    });

    it('returns null for unowned premium pals', () => {
      const text = getPalActionText(mockPremiumPalsHubPal, false);
      expect(text).toBeNull();
    });
  });

  describe('getPremiumInfoText', () => {
    it('returns a non-empty string', () => {
      const text = getPremiumInfoText();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });
  });

  describe('shouldShowPalContent', () => {
    it('returns true for free public pals', () => {
      expect(shouldShowPalContent(mockPalsHubPal)).toBe(true);
    });

    it('returns false for unowned premium pals', () => {
      expect(shouldShowPalContent(mockPremiumPalsHubPal)).toBe(false);
    });

    it('returns true for owned premium pals', () => {
      expect(shouldShowPalContent(mockOwnedPremiumPal)).toBe(true);
    });
  });
});
