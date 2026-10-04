import React from 'react';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';

import {IapAdapter} from '../IapAdapter';
import {fakeStore} from '../../fakeStore';

jest.mock('../../fakeStore', () => ({
  fakeStore: {run: jest.fn()},
}));

describe('IapAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the command surface', () => {
    const {getByTestId} = render(<IapAdapter />);
    expect(getByTestId('iap-command-input')).toBeTruthy();
    expect(getByTestId('iap-command-result')).toBeTruthy();
  });

  it('runs a command and shows its result', async () => {
    (fakeStore.run as jest.Mock).mockResolvedValueOnce('{"next":"pending"}');
    const {getByTestId} = render(<IapAdapter />);

    fireEvent.changeText(getByTestId('iap-command-input'), 'next::pending');

    await waitFor(() => {
      expect(getByTestId('iap-command-result').props.accessibilityLabel).toBe(
        '{"next":"pending"}',
      );
    });
    expect(fakeStore.run).toHaveBeenCalledWith('next::pending');
  });

  it('shows an error when a command fails', async () => {
    (fakeStore.run as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const {getByTestId} = render(<IapAdapter />);

    fireEvent.changeText(getByTestId('iap-command-input'), 'read');

    await waitFor(() => {
      expect(getByTestId('iap-command-result').props.accessibilityLabel).toBe(
        'ERROR: boom',
      );
    });
  });

  it('ignores empty text', () => {
    const {getByTestId} = render(<IapAdapter />);
    fireEvent.changeText(getByTestId('iap-command-input'), '');
    expect(fakeStore.run).not.toHaveBeenCalled();
  });
});
