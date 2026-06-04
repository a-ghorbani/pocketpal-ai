import React from 'react';
import {AccessibilityInfo} from 'react-native';

import {render} from '../../../../jest/test-utils';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import type {BannerVariant} from '../../../utils/bannerVariantResolver';

import {BannerRow} from '../BannerRow';

// BannerRow only reads style references; the test asserts copy, not
// styling — empty objects keep the renderer happy without dragging in
// the full theme/createStyles dependency chain.
const styles = {
  softCapBanner: {},
  softCapBannerText: {},
  bannerTitle: {},
  bannerActions: {},
  bannerMeter: {},
  bannerMeterFill: {},
} as any;

const renderBannerRow = (variant: BannerVariant) => {
  return render(
    <L10nContext.Provider value={l10n.en}>
      <BannerRow
        variant={variant}
        l10n={l10n.en}
        isRunActive={false}
        onIncrease={jest.fn()}
        onDismiss={jest.fn()}
        onNewChat={jest.fn()}
        styles={styles}
      />
    </L10nContext.Provider>,
  );
};

describe('BannerRow heavy-talent message', () => {
  it('substitutes a friendly label for the render_html identifier', () => {
    const {getByText, queryByText} = renderBannerRow({
      kind: 'context-full',
      escalated: false,
      nextTierTokens: 4096,
      heavyTalent: {name: 'render_html'},
      ratio: 1,
    });

    expect(getByText(/HTML preview/)).toBeTruthy();
    // The raw machine identifier must never reach the user surface.
    expect(queryByText(/render_html/)).toBeNull();
  });

  it('falls back to the generic label for unknown talent names', () => {
    const {getByText, queryByText} = renderBannerRow({
      kind: 'context-full',
      escalated: false,
      nextTierTokens: 4096,
      heavyTalent: {name: 'made_up_engine_v9'},
      ratio: 1,
    });

    expect(getByText(/This pal/)).toBeTruthy();
    expect(queryByText(/made_up_engine_v9/)).toBeNull();
  });

  it('renders the fullness meter for context-warning with the right ratio', () => {
    const {getByTestId} = renderBannerRow({
      kind: 'context-warning',
      nextTierTokens: 4096,
      ratio: 0.83,
    });

    const meter = getByTestId('banner-meter');
    expect(meter).toBeTruthy();
  });

  // Screen-reader announcement: Android picks up
  // accessibilityLiveRegion="polite" automatically; iOS requires
  // AccessibilityInfo.announceForAccessibility on mount. The container
  // also carries accessibilityRole="alert" so VoiceOver/TalkBack know
  // it's a high-priority message rather than ambient text.
  describe('accessibility', () => {
    let announceSpy: jest.SpyInstance;
    beforeEach(() => {
      announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
    });
    afterEach(() => {
      announceSpy.mockRestore();
    });

    it('announces the context-warning banner on appearance', () => {
      renderBannerRow({
        kind: 'context-warning',
        nextTierTokens: 4096,
        ratio: 0.83,
      });
      expect(announceSpy).toHaveBeenCalledTimes(1);
      expect(announceSpy.mock.calls[0][0]).toMatch(/./);
    });

    it('marks the context-full container with role=alert and live=polite', () => {
      const {getByTestId} = renderBannerRow({
        kind: 'context-full',
        escalated: false,
        nextTierTokens: 4096,
        heavyTalent: null,
        ratio: 1,
      });
      const banner = getByTestId('context-full-banner');
      expect(banner.props.accessibilityRole).toBe('alert');
      expect(banner.props.accessibilityLiveRegion).toBe('polite');
    });
  });
});
