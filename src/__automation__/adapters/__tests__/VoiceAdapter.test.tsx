import React from 'react';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';

import {VoiceAdapter} from '../VoiceAdapter';
import {runVoiceCommand} from '../../voiceAutomation';

jest.mock('../../voiceAutomation', () => ({
  runVoiceCommand: jest.fn(),
}));

describe('VoiceAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs a command and reports it', async () => {
    (runVoiceCommand as jest.Mock).mockResolvedValueOnce(undefined);
    const {getByTestId} = render(<VoiceAdapter />);

    fireEvent.changeText(getByTestId('voice-command-input'), 'state::muted');

    await waitFor(() => {
      expect(getByTestId('voice-command-result').props.accessibilityLabel).toBe(
        'ok state::muted',
      );
    });
    expect(runVoiceCommand).toHaveBeenCalledWith('state::muted');
  });

  it('shows an error when a command fails', async () => {
    (runVoiceCommand as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const {getByTestId} = render(<VoiceAdapter />);

    fireEvent.changeText(getByTestId('voice-command-input'), 'seed::spoken');

    await waitFor(() => {
      expect(getByTestId('voice-command-result').props.accessibilityLabel).toBe(
        'ERROR: boom',
      );
    });
  });
});
