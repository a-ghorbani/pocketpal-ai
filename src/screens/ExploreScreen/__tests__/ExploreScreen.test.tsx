import React from 'react';

import {render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';

import {ExploreScreen} from '../ExploreScreen';

describe('ExploreScreen', () => {
  it('renders the Explore tab placeholder (scaffold, no PalsHub content)', () => {
    const {getByTestId, getByText} = render(<ExploreScreen />, {
      withSafeArea: true,
    });
    expect(getByTestId('explore-screen')).toBeTruthy();
    expect(getByText(l10n.en.tabs.explore)).toBeTruthy();
  });
});
