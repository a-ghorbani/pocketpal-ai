import React from 'react';

import {runInAction} from 'mobx';

import {act, render, fireEvent, waitFor} from '../../../../jest/test-utils';

import {VoiceAdapter} from '../VoiceAdapter';
import {runVoiceCommand, voiceTraceDump} from '../../voiceAutomation';

jest.mock('../../voiceAutomation', () => ({
  runVoiceCommand: jest.fn(),
  voiceTraceDump: require('mobx').observable.box(''),
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

  it('ignores a cleared input', () => {
    const {getByTestId} = render(<VoiceAdapter />);

    fireEvent.changeText(getByTestId('voice-command-input'), '');

    expect(runVoiceCommand).not.toHaveBeenCalled();
    expect(getByTestId('voice-command-result').props.accessibilityLabel).toBe(
      '',
    );
  });

  it('shows the last trace dump', () => {
    const {getByTestId} = render(<VoiceAdapter />);

    act(() => {
      runInAction(() => voiceTraceDump.set('12 phase to=thinking'));
    });

    expect(getByTestId('voice-trace-result').props.accessibilityLabel).toBe(
      '12 phase to=thinking',
    );
  });
});
