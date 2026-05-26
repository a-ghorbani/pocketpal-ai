import React from 'react';
import {Text} from 'react-native';
import {within} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {Dialog} from '../Dialog';
import {Modal} from '../../Modal/Modal';
import {Sheet} from '../../Sheet/Sheet';

describe('Cross-overlay header reuse', () => {
  it('all three overlays render the same ui-header subtree', () => {
    const dialog = render(
      <Dialog isVisible title="Hello" subtitle="World">
        <Text>body</Text>
      </Dialog>,
    );
    const modal = render(
      <Modal isVisible title="Hello" subtitle="World">
        <Text>body</Text>
      </Modal>,
    );
    const sheet = render(
      <Sheet isVisible title="Hello" subtitle="World">
        <Text>body</Text>
      </Sheet>,
      {withBottomSheetProvider: true, withSafeArea: true},
    );

    const dialogHeader = within(dialog.getByTestId('ui-header'));
    const modalHeader = within(modal.getByTestId('ui-header'));
    const sheetHeader = within(sheet.getByTestId('ui-header'));

    // The title and subtitle render in all three identically.
    expect(dialogHeader.getByText('Hello')).toBeTruthy();
    expect(modalHeader.getByText('Hello')).toBeTruthy();
    expect(sheetHeader.getByText('Hello')).toBeTruthy();
    expect(dialogHeader.getByText('World')).toBeTruthy();
    expect(modalHeader.getByText('World')).toBeTruthy();
    expect(sheetHeader.getByText('World')).toBeTruthy();
  });
});
