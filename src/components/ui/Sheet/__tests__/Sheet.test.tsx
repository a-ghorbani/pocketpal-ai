import React from 'react';
import {Text} from 'react-native';

import {render} from '../../../../../jest/test-utils';
import {Sheet} from '../Sheet';

describe('Sheet', () => {
  it('renders a single ui-header in the tree', () => {
    const {getAllByTestId} = render(
      <Sheet isVisible title="Pick a model" subtitle="Loaded models only">
        <Text>body</Text>
        <Sheet.Actions
          primary={{label: 'Apply', onPress: () => {}}}
          secondary={{label: 'Cancel', onPress: () => {}}}
        />
      </Sheet>,
      {withBottomSheetProvider: true, withSafeArea: true},
    );
    const headers = getAllByTestId('ui-header');
    expect(headers).toHaveLength(1);
  });
});
