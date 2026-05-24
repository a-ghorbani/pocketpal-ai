import React from 'react';
import {Text} from 'react-native';

import {render} from '../../../../../jest/test-utils';
import {Modal} from '../Modal';

describe('Modal', () => {
  it('renders a single ds-header when visible (I_DS3)', () => {
    const {getAllByTestId} = render(
      <Modal isVisible title="Settings">
        <Text>body</Text>
      </Modal>,
    );
    const headers = getAllByTestId('ds-header');
    expect(headers).toHaveLength(1);
  });

  it('renders nothing when not visible', () => {
    const {queryByTestId} = render(
      <Modal title="Settings">
        <Text>body</Text>
      </Modal>,
    );
    expect(queryByTestId('ds-modal')).toBeNull();
  });
});
