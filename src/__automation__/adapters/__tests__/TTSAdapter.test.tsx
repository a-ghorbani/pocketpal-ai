import React from 'react';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';

import {TTSAdapter} from '../TTSAdapter';

import {runTtsCommand, readTtsStatus} from '../../ttsAutomation';

jest.mock('../../ttsAutomation', () => ({
  runTtsCommand: jest.fn().mockResolvedValue(undefined),
  readTtsStatus: jest.fn().mockResolvedValue('{"cmd":"x","state":"done"}'),
}));

describe('TTSAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the container and inputs with correct testIDs', () => {
    const {getByTestId} = render(<TTSAdapter />);

    expect(getByTestId('tts-command-container')).toBeTruthy();
    expect(getByTestId('tts-command-input')).toBeTruthy();
    expect(getByTestId('tts-command-result')).toBeTruthy();
  });

  it('runs a download command', async () => {
    const {getByTestId} = render(<TTSAdapter />);

    fireEvent.changeText(getByTestId('tts-command-input'), 'download::kitten');

    await waitFor(() => {
      expect(runTtsCommand).toHaveBeenCalledWith('download::kitten');
    });
  });

  it('reads status on read::status', async () => {
    const {getByTestId} = render(<TTSAdapter />);

    fireEvent.changeText(getByTestId('tts-command-input'), 'read::status');

    await waitFor(() => {
      expect(readTtsStatus).toHaveBeenCalled();
      expect(runTtsCommand).not.toHaveBeenCalled();
    });
  });

  it('ignores empty text', async () => {
    const {getByTestId} = render(<TTSAdapter />);

    fireEvent.changeText(getByTestId('tts-command-input'), '');

    await new Promise(r => setTimeout(r, 50));
    expect(runTtsCommand).not.toHaveBeenCalled();
  });

  it('is hidden but remains in accessibility tree', () => {
    const {getByTestId} = render(<TTSAdapter />);
    const container = getByTestId('tts-command-container');

    expect(container.props.style).toEqual(
      expect.objectContaining({
        position: 'absolute',
        backgroundColor: 'transparent',
      }),
    );
  });
});
