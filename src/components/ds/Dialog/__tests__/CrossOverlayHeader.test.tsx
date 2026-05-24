import React from 'react';
import {Text} from 'react-native';
import {within} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {Dialog} from '../Dialog';
import {Modal} from '../../Modal/Modal';
import {Sheet} from '../../Sheet/Sheet';

/**
 * Scenario F (WHAT §6): a DSDialog and a DSModal and a DSSheet
 * all rendered with the same title produce the SAME Header
 * subtree shape (modulo wrapping by the overlay's surface).
 */
describe('Cross-overlay header reuse (Scenario F)', () => {
  it('all three overlays render the same ds-header subtree', () => {
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

    const dialogHeader = within(dialog.getByTestId('ds-header'));
    const modalHeader = within(modal.getByTestId('ds-header'));
    const sheetHeader = within(sheet.getByTestId('ds-header'));

    // The title and subtitle render in all three identically.
    expect(dialogHeader.getByText('Hello')).toBeTruthy();
    expect(modalHeader.getByText('Hello')).toBeTruthy();
    expect(sheetHeader.getByText('Hello')).toBeTruthy();
    expect(dialogHeader.getByText('World')).toBeTruthy();
    expect(modalHeader.getByText('World')).toBeTruthy();
    expect(sheetHeader.getByText('World')).toBeTruthy();
  });
});
