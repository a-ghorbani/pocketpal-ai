import React from 'react';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';

import {MemoryAdapter} from '../MemoryAdapter';

import {
  takeMemorySnapshot,
  clearMemorySnapshots,
  readMemorySnapshots,
} from '../../../utils/memoryProfile';

jest.mock('../../../utils/memoryProfile', () => ({
  takeMemorySnapshot: jest.fn().mockResolvedValue(undefined),
  clearMemorySnapshots: jest.fn().mockResolvedValue(undefined),
  readMemorySnapshots: jest.fn().mockResolvedValue('[{"label":"test"}]'),
}));

describe('MemoryAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the container and inputs with correct testIDs', () => {
    const {getByTestId} = render(<MemoryAdapter />);

    expect(getByTestId('memory-snapshot-container')).toBeTruthy();
    expect(getByTestId('memory-snapshot-label')).toBeTruthy();
    expect(getByTestId('memory-snapshot-result')).toBeTruthy();
  });

  it('takes snapshot when text starts with snap::', async () => {
    const {getByTestId} = render(<MemoryAdapter />);

    fireEvent.changeText(
      getByTestId('memory-snapshot-label'),
      'snap::model_loaded',
    );

    await waitFor(() => {
      expect(takeMemorySnapshot).toHaveBeenCalledWith('model_loaded');
    });
  });

  it('uses "unnamed" when snap:: has no label', async () => {
    const {getByTestId} = render(<MemoryAdapter />);

    fireEvent.changeText(getByTestId('memory-snapshot-label'), 'snap::');

    await waitFor(() => {
      expect(takeMemorySnapshot).toHaveBeenCalledWith('unnamed');
    });
  });

  it('clears snapshots on clear::snapshots', async () => {
    const {getByTestId} = render(<MemoryAdapter />);

    fireEvent.changeText(
      getByTestId('memory-snapshot-label'),
      'clear::snapshots',
    );

    await waitFor(() => {
      expect(clearMemorySnapshots).toHaveBeenCalled();
      expect(takeMemorySnapshot).not.toHaveBeenCalled();
    });
  });

  it('reads snapshots on read::snapshots', async () => {
    const {getByTestId} = render(<MemoryAdapter />);

    fireEvent.changeText(
      getByTestId('memory-snapshot-label'),
      'read::snapshots',
    );

    await waitFor(() => {
      expect(readMemorySnapshots).toHaveBeenCalled();
    });
  });

  it('ignores text that is not a command', async () => {
    const {getByTestId} = render(<MemoryAdapter />);

    fireEvent.changeText(getByTestId('memory-snapshot-label'), 'random text');

    await new Promise(r => setTimeout(r, 50));
    expect(takeMemorySnapshot).not.toHaveBeenCalled();
    expect(clearMemorySnapshots).not.toHaveBeenCalled();
  });

  it('is hidden but remains in accessibility tree', () => {
    const {getByTestId} = render(<MemoryAdapter />);
    const container = getByTestId('memory-snapshot-container');

    expect(container.props.style).toEqual(
      expect.objectContaining({
        position: 'absolute',
        backgroundColor: 'transparent',
      }),
    );
  });
});
