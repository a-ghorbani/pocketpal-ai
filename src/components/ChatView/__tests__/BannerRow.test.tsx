import React from 'react';

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
    });

    expect(getByText(/This pal/)).toBeTruthy();
    expect(queryByText(/made_up_engine_v9/)).toBeNull();
  });
});
