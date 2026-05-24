import React from 'react';
import {Text} from 'react-native';

import {render} from '../../../../../jest/test-utils';
import {Dialog} from '../Dialog';

describe('Dialog', () => {
  it('renders a single ds-header when visible (I_DS3)', () => {
    const {getAllByTestId} = render(
      <Dialog isVisible title="Confirm">
        <Text>body</Text>
      </Dialog>,
    );
    const headers = getAllByTestId('ds-header');
    expect(headers).toHaveLength(1);
  });

  it('renders nothing when not visible', () => {
    const {queryByTestId} = render(
      <Dialog title="Confirm">
        <Text>body</Text>
      </Dialog>,
    );
    expect(queryByTestId('ds-dialog')).toBeNull();
  });
});
