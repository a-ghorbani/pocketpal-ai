import React from 'react';
import {Text} from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';

import {Sheet} from '../Sheet';

describe('Sheet', () => {
  it('calls onClose when the close button is pressed', () => {
    const onClose = jest.fn();

    const {getByTestId} = render(
      <Sheet isVisible onClose={onClose}>
        <Text>Sheet Content</Text>
      </Sheet>,
    );

    fireEvent.press(getByTestId('sheet-close-button'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
